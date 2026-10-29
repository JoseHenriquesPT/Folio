import { describe, expect, it } from "vitest";
import { imageFromClick } from "./imageView";

function editorWithImage(html: string): HTMLDivElement {
  const editor = document.createElement("div");
  editor.className = "tiptap";
  editor.innerHTML = html;
  document.body.append(editor);
  return editor;
}

describe("imageFromClick", () => {
  it("extracts the src and alt when an image inside the note is clicked", () => {
    const editor = editorWithImage(
      '<p><img src="https://files.example/a.png" alt="A chart"></p>'
    );
    const image = editor.querySelector("img");

    expect(imageFromClick(image)).toEqual({
      src: "https://files.example/a.png",
      alt: "A chart",
    });
  });

  it("treats a missing alt as an empty string", () => {
    const editor = editorWithImage('<p><img src="/x.png"></p>');

    expect(imageFromClick(editor.querySelector("img"))).toEqual({
      src: "/x.png",
      alt: "",
    });
  });

  it("ignores clicks that are not on an image", () => {
    const editor = editorWithImage("<p>Hello</p>");

    expect(imageFromClick(editor.querySelector("p"))).toBeNull();
    expect(imageFromClick(null)).toBeNull();
    expect(imageFromClick(document.body)).toBeNull();
  });

  it("ignores images outside the note body", () => {
    const outside = document.createElement("img");
    outside.src = "https://files.example/thumb.png";

    expect(imageFromClick(outside)).toBeNull();
  });

  it("ignores an image without a src", () => {
    const editor = editorWithImage('<p><img alt="Chart"></p>');
    const image = editor.querySelector("img");
    image?.removeAttribute("src");

    expect(imageFromClick(image)).toBeNull();
  });
});
