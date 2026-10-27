// Local-only load-test seed. Never run this against the hosted project.
//
//   node scripts/seed-notes.mjs --notes 5000
//
// Reads the local Supabase service key from `npx supabase status -o env`.
// The service key is never printed or written. Sign in locally as
// seed@folio.local with a magic link to inspect the vault.

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function readStatusEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  const output = execFileSync(
    "npx",
    ["supabase", "status", "-o", "env"],
    { encoding: "utf8", shell: true }
  );
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2];
  }

  if (!values.API_URL || !values.SERVICE_ROLE_KEY) {
    throw new Error("Could not read the local Supabase status.");
  }
  return { url: values.API_URL, serviceKey: values.SERVICE_ROLE_KEY };
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const { url, serviceKey } = readStatusEnv();
if (!/^(http:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  throw new Error(`Refusing to seed a non-local Supabase URL: ${url}`);
}

const email = argValue("--email", "seed@folio.local");
const totalNotes = Number(argValue("--notes", "5000"));
const reset = process.argv.includes("--reset");

if (!Number.isFinite(totalNotes) || totalNotes < 1) {
  throw new Error("--notes must be a positive number.");
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser() {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return data.users.find((user) => user.email === email) ?? null;
}

async function ensureUser() {
  let user = await findUser();

  if (user && reset) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    user = null;
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Seed Vault" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`created seed user ${email}`);
  } else {
    console.log(`using existing seed user ${email}`);
  }

  return user;
}

function noteBody(index) {
  const topics = [
    "garden planning",
    "reading notes",
    "meeting recap",
    "travel list",
    "shopping ideas",
    "project sketch",
  ];
  const topic = topics[index % topics.length];
  const needle = index % 50 === 0 ? " needle" : "";
  return [
    `<h2>${topic}</h2>`,
    `<p>Entry ${String(index + 1).padStart(5, "0")} for the seeded vault.${needle}</p>`,
    "<p>This note exists to exercise pagination, search, and card rendering at scale.</p>",
    index % 9 === 0
      ? "<ul><li>First item</li><li>Second item</li><li>Third item</li></ul>"
      : "",
  ].join("");
}

const user = await ensureUser();

const { count: existing, error: countError } = await admin
  .from("notes")
  .select("id", { count: "exact", head: true })
  .eq("owner_id", user.id);
if (countError) throw countError;

if (existing > 0 && !reset) {
  console.log(
    `seed user already has ${existing} notes; use --reset to rebuild the vault`
  );
  process.exit(0);
}

if (reset) {
  const { error } = await admin.from("notes").delete().eq("owner_id", user.id);
  if (error) throw error;
  const { error: notebookError } = await admin
    .from("notebooks")
    .delete()
    .eq("owner_id", user.id);
  if (notebookError) throw notebookError;
  const { error: resetTagError } = await admin
    .from("tags")
    .delete()
    .eq("owner_id", user.id);
  if (resetTagError) throw resetTagError;
}

const started = Date.now();

const roots = [
  { name: "Work" },
  { name: "Personal" },
  { name: "Reading" },
  { name: "Archive" },
].map((notebook) => ({ ...notebook, owner_id: user.id, position: 0 }));

const { data: rootRows, error: rootError } = await admin
  .from("notebooks")
  .insert(roots)
  .select("id, name");
if (rootError) throw rootError;

const children = [
  {
    name: "Projects",
    parent_id: rootRows.find((row) => row.name === "Work").id,
  },
  {
    name: "Recipes",
    parent_id: rootRows.find((row) => row.name === "Personal").id,
  },
].map((notebook, index) => ({
  ...notebook,
  owner_id: user.id,
  position: index,
}));

const { data: childRows, error: childError } = await admin
  .from("notebooks")
  .insert(children)
  .select("id");
if (childError) throw childError;

const notebookIds = [...rootRows.map((row) => row.id), ...childRows.map((row) => row.id)];

const tagNames = ["ideas", "reference", "urgent", "garden", "finance", "travel"];
const { data: tagRows, error: tagError } = await admin
  .from("tags")
  .insert(tagNames.map((name) => ({ name, owner_id: user.id })))
  .select("id, name");
if (tagError) throw tagError;

const batchSize = 500;
let inserted = 0;

for (let start = 0; start < totalNotes; start += batchSize) {
  const end = Math.min(totalNotes, start + batchSize);
  const rows = [];

  for (let index = start; index < end; index += 1) {
    const title = `Note ${index + 1} — ${
      ["garden", "reading", "meeting", "travel", "shopping", "project"][index % 6]
    }`;
    rows.push({
      owner_id: user.id,
      notebook_id: notebookIds[index % notebookIds.length],
      title,
      body_html: noteBody(index),
      pinned: index % 97 === 0,
      archived: index % 211 === 0,
      deleted_at:
        index % 503 === 0
          ? new Date(Date.now() - 86_400_000).toISOString()
          : null,
    });
  }

  const { data, error } = await admin.from("notes").insert(rows).select("id");
  if (error) throw error;

  const links = [];
  for (let offset = 0; offset < data.length; offset += 1) {
    const index = start + offset;
    links.push({
      note_id: data[offset].id,
      tag_id: tagRows[index % tagRows.length].id,
    });
    if (index % 3 === 0) {
      links.push({
        note_id: data[offset].id,
        tag_id: tagRows[(index + 1) % tagRows.length].id,
      });
    }
  }

  for (let linkStart = 0; linkStart < links.length; linkStart += 1000) {
    const { error: linkError } = await admin
      .from("note_tags")
      .insert(links.slice(linkStart, linkStart + 1000));
    if (linkError) throw linkError;
  }

  inserted += data.length;
  console.log(`seeded ${inserted}/${totalNotes} notes`);
}

console.log("");
console.log(`seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`user: ${email}`);
console.log(`user id: ${user.id}`);
console.log(`notes: ${inserted}`);
console.log("sign in locally with a magic link to inspect the vault");
