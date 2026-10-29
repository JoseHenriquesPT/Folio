import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ConfirmProvider,
  useConfirm,
  type ConfirmOptions,
} from "./ConfirmProvider";

function Harness({
  options,
  parallel = false,
}: {
  options: ConfirmOptions[];
  parallel?: boolean;
}) {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState("none");

  async function ask() {
    setAnswer("pending");

    if (parallel) {
      const answers = await Promise.all(options.map((item) => confirm(item)));
      setAnswer(answers.map(String).join(","));
      return;
    }

    const answers: string[] = [];
    for (const item of options) {
      answers.push(String(await confirm(item)));
    }
    setAnswer(answers.join(","));
  }

  return (
    <>
      <button type="button" onClick={() => void ask()}>
        Ask
      </button>
      <p role="status">{answer}</p>
    </>
  );
}

const destructive: ConfirmOptions = {
  title: "Move to trash",
  message: "Move this note to the trash?",
  tone: "danger",
};

const archive: ConfirmOptions = { title: "Archive", message: "Archive it?" };

const second: ConfirmOptions = { title: "Second", message: "Again?" };

async function startAsk(options: ConfirmOptions[], parallel = false) {
  render(
    <ConfirmProvider>
      <Harness options={options} parallel={parallel} />
    </ConfirmProvider>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

async function expectAnswer(expected: string) {
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(expected);
  });
}

describe("ConfirmProvider", () => {
  it("shows the title and message in an alert dialog", async () => {
    await startAsk([destructive]);

    const dialog = screen.getByRole("alertdialog", { name: "Move to trash" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Move this note to the trash?")).toBeTruthy();
  });

  it("resolves true when the confirm button is clicked", async () => {
    const user = await startAsk([destructive]);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await expectAnswer("true");
  });

  it("resolves false when cancelled, on Escape, or on a backdrop tap", async () => {
    const user = await startAsk([destructive]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expectAnswer("false");

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.keyboard("{Escape}");
    await expectAnswer("false");

    await user.click(screen.getByRole("button", { name: "Ask" }));
    const backdrop = screen.getByRole("alertdialog").parentElement;
    if (!backdrop) throw new Error("confirm dialog has no backdrop");
    fireEvent.mouseDown(backdrop);
    await expectAnswer("false");
  });

  it("focuses Cancel for a destructive tone so Enter cannot destroy", async () => {
    const user = await startAsk([destructive]);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" })
    );

    await user.keyboard("{Enter}");
    await expectAnswer("false");
  });

  it("focuses the confirm button by default so Enter confirms", async () => {
    const user = await startAsk([archive]);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Confirm" })
    );

    await user.keyboard("{Enter}");
    await expectAnswer("true");
  });

  it("queues a second request instead of leaving it hanging", async () => {
    const user = await startAsk([destructive, second], true);

    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByText("Again?")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await expectAnswer("false,true");
  });

  it("restores focus to the element that had it before opening", async () => {
    function WithTrigger() {
      const confirm = useConfirm();
      return (
        <button type="button" onClick={() => void confirm(destructive)}>
          Ask
        </button>
      );
    }

    render(
      <ConfirmProvider>
        <WithTrigger />
      </ConfirmProvider>
    );

    const trigger = screen.getByRole("button", { name: "Ask" });
    trigger.focus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("resolves false when the provider unmounts while open", async () => {
    const holder: { promise?: Promise<boolean> } = {};

    function Collector() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={() => {
            holder.promise = confirm(destructive);
          }}
        >
          Ask
        </button>
      );
    }

    const view = render(
      <ConfirmProvider>
        <Collector />
      </ConfirmProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    view.unmount();

    await expect(holder.promise).resolves.toBe(false);
  });
});
