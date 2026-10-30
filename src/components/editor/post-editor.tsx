"use client";

import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { Attribution, PassageQuote } from "@/components/passage/passage";
import type { VerseRange } from "@/lib/bible/verse-id";
import { quoteNode } from "@/lib/ask/quote";
import { linkHref } from "@/lib/editor/links";
import { STUDY_COOKIE, type PassageData, type TranslationInfo } from "@/lib/editor/types";
import { docToMarkdown, markdownToDoc, type EditorNode } from "@/lib/items/editor-document";
import type { ItemVisibility } from "@/lib/items/queries";
import { MAX_ITEM_TITLE_LENGTH, MAX_NOTE_BODY_LENGTH } from "@/lib/items/validate";

import { slashItems, type BlockContext } from "./blocks";
import { PassageNode, PostDocument } from "./passage-node";
import { primePassages } from "./passages";
import { PublishMenu } from "./publish-menu";
import { SettingsMenu } from "./settings-menu";
import { SlashCommands, SlashMenu, useSlashMenu } from "./slash-menu";
import { StudySidebar, type ReadRequest, type StudyBridge } from "./study-sidebar";
import { InsertButton, SelectionToolbar } from "./toolbar";
import { useAutosave, type SaveStatus, type Values } from "./use-autosave";

// The editor of reflections and notes: the page is the post. A centred
// column with the title as a large field and the body under it, written as
// rich text (src/lib/items/editor-document.ts converts it to and from the
// stored Markdown); a quiet bar on top with the save state, the study
// sidebar's toggle, the post's settings and "Publish"; and the study sidebar
// on the right (a sheet on a phone).
//
// A note is the same editor, short: no title, no passages in its text (a
// note is on the verses it was written on, shown above it), and "Post".

export type PostEditorProps = {
  // The item; none for a new post, which its first save makes.
  id?: string;
  kind: "reflection" | "note";
  saved: Values;
  savedAt?: string;
  visibility: ItemVisibility;
  publishedAt: string | null;
  // Every loaded translation, the site's default first.
  translations: TranslationInfo[];
  // The ids of those that can be searched by meaning.
  // Whether this install can answer questions: the Ask tab.
  ask: boolean;
  meaningTranslations: string[];
  // The verses of the cards the post opens with (src/components/editor/passages.ts).
  passages: Record<string, PassageData>;
  // A note's verses: for a new one, as the reader selected them.
  anchor?: { v: string; translationId: string; reference: string; passage?: PassageData };
  // Where "back" goes, and whether to go there once a new note is posted.
  back: { href: string; label: string; afterPost?: boolean };
  // Whether the study sidebar is open on a wide screen (remembered in a cookie).
  studyOpen: boolean;
  // What the sidebar's "Read" opens on.
  reading?: string;
};


const STATUS: Record<SaveStatus, string> = {
  new: "New draft",
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  failed: "Not saved",
};

// A phone, or anything too narrow for the sidebar beside the post.
const NARROW = "(max-width: 1023px)";
function useNarrow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

const barButton =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 aria-expanded:bg-stone-100 aria-expanded:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:aria-expanded:bg-stone-800 dark:aria-expanded:text-stone-100";

// The document to open: the stored Markdown, with a paragraph to write in
// after a passage or an image at the end.
function openDoc(markdown: string, passages: boolean): EditorNode {
  const doc = markdownToDoc(markdown, { passages });
  const last = doc.content.at(-1);
  if (last && !["paragraph", "heading", "bulletList", "orderedList", "blockquote"].includes(last.type)) {
    doc.content.push({ type: "paragraph" });
  }
  return doc;
}

// Puts the cursor in text: after a selected block, or in a new paragraph
// after it when no text follows.
function textCursor(editor: Editor) {
  const { selection, doc, schema } = editor.state;
  if (!(selection instanceof NodeSelection) && selection.$from.depth > 0) return;
  const after = selection.to;
  const tr = editor.state.tr;
  if (!doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  editor.view.dispatch(tr);
}

export function PostEditor(props: PostEditorProps) {
  const { kind, translations, anchor, back } = props;
  const reflection = kind === "reflection";
  const router = useRouter();
  const [title, setTitle] = useState(props.saved.title);
  const [tags, setTags] = useState(props.saved.tags);
  const [visibility, setVisibility] = useState(props.visibility);
  const [publishedAt, setPublishedAt] = useState(props.publishedAt);
  const [length, setLength] = useState(props.saved.markdown.length);
  // Text this browser kept, for an editor not made yet.
  const pendingRestore = useRef<Values | null>(null);
  const editorRef = useRef<Editor | null>(null);

  // Before the editor prints its passage blocks.
  useState(() => primePassages(props.passages));

  const autosave = useAutosave({
    id: props.id,
    kind,
    saved: props.saved,
    savedAt: props.savedAt,
    anchor: anchor && { v: anchor.v, translationId: anchor.translationId },
    onRestore: useCallback(
      (values: Values) => {
        setTitle(values.title);
        setTags(values.tags);
        setLength(values.markdown.length);
        const current = editorRef.current;
        if (current) {
          current.commands.setContent(openDoc(values.markdown, reflection), { emitUpdate: false });
        } else {
          pendingRestore.current = values;
        }
      },
      [reflection],
    ),
  });
  const { status, failure, change, flush } = autosave;

  // --- The study sidebar ---
  const narrow = useNarrow();
  const [studyOpen, setStudyOpen] = useState(props.studyOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState("read");
  const [reading, setReading] = useState<ReadRequest>({ query: props.reading ?? "", nonce: props.reading ? 1 : 0 });
  const showStudy = narrow ? sheetOpen : studyOpen;
  const toggleStudy = () => {
    if (narrow) {
      setSheetOpen((open) => !open);
      return;
    }
    const open = !studyOpen;
    setStudyOpen(open);
    document.cookie = `${STUDY_COOKIE}=${open ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
  };
  const openRead = (query: string, select?: VerseRange[]) => {
    setTab("read");
    setReading((current) => ({ query, select, focus: !query, nonce: current.nonce + 1 }));
    if (narrow) setSheetOpen(true);
    else if (!studyOpen) toggleStudy();
  };

  // --- The editor ---
  const slash = useSlashMenu();
  const [imagePrompt, setImagePrompt] = useState<{ left: number; top: number } | null>(null);
  const study = useRef({ translationId: translations[0]?.id ?? "", openRead });
  useEffect(() => {
    study.current.openRead = openRead;
  });

  const extensions = useMemo(() => {
    const context: BlockContext = {
      passages: reflection,
      translations,
      translation: () => translations.find((translation) => translation.id === study.current.translationId),
      promptImage: () => {
        const view = editorRef.current?.view;
        if (!view) return;
        const at = view.coordsAtPos(view.state.selection.from);
        setImagePrompt({ left: at.left, top: at.bottom + 8 });
      },
      lookUp: (query) => study.current.openRead(query),
    };
    return [
      ...(reflection ? [PostDocument, PassageNode.configure({ translations })] : []),
      StarterKit.configure({
        document: reflection ? false : undefined,
        // Markdown has no way to write these.
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { target: null, rel: "noopener noreferrer" },
          isAllowedUri: (url) => linkHref(url) !== undefined,
        },
        dropcursor: { class: "drop-cursor", width: 3 },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: ({ editor: current, node }) =>
          current.state.doc.childCount === 1 && node.type.name === "paragraph"
            ? reflection
              ? "Write. Type / for a passage, a heading, a list and more."
              : anchor
                ? `A note on ${anchor.reference}…`
                : "What’s on your mind?"
            : node.type.name === "paragraph"
              ? reflection
                ? "Type / to insert"
                : ""
              : "",
      }),
      // The menu's callbacks (and the refs in `context`) run on key presses
      // in the editor, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      SlashCommands.configure({
        items: (query) => slashItems(query, context),
        onChange: slash.handlers.onChange,
        onKeyDown: slash.handlers.onKeyDown,
      }),
    ];
    // The extensions are made once, for the life of the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: useMemo(() => openDoc(props.saved.markdown, reflection), []), // eslint-disable-line react-hooks/exhaustive-deps
    // A new note starts in its text; a new reflection in its title (below).
    autofocus: reflection ? false : "end",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": reflection ? "Post body" : "Note",
        class: "post-prose",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = docToMarkdown(current.getJSON() as EditorNode);
      setLength(markdown.length);
      change({ markdown });
    },
    onBlur: () => void flush(),
    onCreate: ({ editor: created }) => {
      editorRef.current = created;
      // The cursor starts at the end, where writing goes on; not on a passage
      // block at the top, where typing would replace it.
      created.view.dispatch(created.state.tr.setSelection(Selection.atEnd(created.state.doc)));
      const values = pendingRestore.current;
      pendingRestore.current = null;
      if (values) {
        created.commands.setContent(openDoc(values.markdown, reflection), { emitUpdate: false });
      }
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const titleField = useRef<HTMLTextAreaElement>(null);
  // A title grows with what is typed, and with a narrower column.
  const fitTitle = useCallback(() => {
    const field = titleField.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, []);
  useEffect(fitTitle, [title, fitTitle]);
  useEffect(() => {
    const field = titleField.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      fitTitle();
    });
    observer.observe(field);
    void document.fonts?.ready.then(fitTitle);
    return () => observer.disconnect();
  }, [fitTitle]);
  useEffect(() => {
    if (reflection && !props.id) titleField.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bridge: Omit<StudyBridge, "translationId"> = {
    passages: reflection,
    translations,
    ask: props.ask,
    meaningTranslations: props.meaningTranslations,
    itemId: autosave.id,
    reading,
    read: openRead,
    postPassages: () => {
      const found: { reference: string; translation: string | null }[] = [];
      editor?.state.doc.forEach((node) => {
        if (node.type.name === "passage") {
          found.push({ reference: node.attrs.reference, translation: node.attrs.translation ?? null });
        }
      });
      return anchor ? [{ reference: anchor.reference, translation: null }, ...found] : found;
    },
    insertPassage: (reference, translation) => {
      if (!editor) return;
      editor.chain().focus().insertPassage({ reference, translation }).run();
      if (narrow) setSheetOpen(false);
    },
    insertQuote: (quote) => {
      if (!editor) return;
      editor.chain().focus().insertQuote(quoteNode(quote)).run();
      if (narrow) setSheetOpen(false);
    },
    insertLink: (text, href) => {
      if (!editor) return;
      editor.commands.focus();
      textCursor(editor);
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "text", text, marks: [{ type: "link", attrs: { href } }] },
          { type: "text", text: " " },
        ])
        .run();
      if (narrow) setSheetOpen(false);
    },
  };

  const errors = failure.errors ?? {};
  const submitImage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const src = linkHref(String(form.get("src") ?? ""));
    if (src && editor) {
      textCursor(editor);
      editor.chain().focus().setImage({ src, alt: String(form.get("alt") ?? "").trim() || undefined }).run();
    }
    setImagePrompt(null);
  };

  return (
    <div
      data-editor-page={kind}
      data-item-editor={autosave.id ?? "new"}
      className="flex min-h-screen flex-col bg-white font-sans dark:bg-stone-950"
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void flush();
        }
      }}
    >
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-stone-100 bg-white/90 px-3 backdrop-blur sm:px-4 dark:border-stone-900 dark:bg-stone-950/90">
        <Link href={back.href} className={barButton} aria-label={`Back to ${back.label}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
            <path d="M10.3 3.3 5.6 8l4.7 4.7-1 1.1L3.5 8l5.8-5.8Z" />
          </svg>
          <span className="hidden sm:inline">{back.label}</span>
        </Link>
        <p
          role="status"
          data-save-status={status}
          className={`truncate text-sm ${status === "failed" ? "text-red-700 dark:text-red-400" : "text-stone-400 dark:text-stone-500"}`}
        >
          {STATUS[status]}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {!reflection && length > MAX_NOTE_BODY_LENGTH * 0.75 && (
            <span
              className={`mr-1 text-xs tabular-nums ${length > MAX_NOTE_BODY_LENGTH ? "text-red-700 dark:text-red-400" : "text-stone-400"}`}
            >
              {length.toLocaleString("en")} / {MAX_NOTE_BODY_LENGTH.toLocaleString("en")}
            </span>
          )}
          <button
            type="button"
            onClick={toggleStudy}
            aria-expanded={showStudy}
            aria-controls="study-sidebar"
            aria-label="Study"
            title="Look up passages and your content"
            className={barButton}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="M1.5 3.2c0-.4.3-.7.7-.7 1.9 0 3.6.5 5 1.4.3.2.5.2.8 0 1.4-.9 3.1-1.4 5-1.4.4 0 .7.3.7.7v8.6c0 .4-.3.7-.7.7-1.8 0-3.3.5-4.7 1.4a.7.7 0 0 1-.6 0c-1.4-.9-2.9-1.4-4.7-1.4a.7.7 0 0 1-.7-.7Zm1.4.7v7.3c1.4.1 2.6.5 3.7 1V5c-1.1-.6-2.3-1-3.7-1.1Zm5.5 1.1v7.2c1.1-.5 2.3-.9 3.7-1V3.9C10.7 4 9.5 4.4 8.4 5Z" />
            </svg>
            <span className="hidden sm:inline">Study</span>
          </button>
          <SettingsMenu
            kind={kind}
            id={autosave.id}
            tags={tags}
            tagsError={errors.tags}
            onTags={(value) => {
              setTags(value);
              change({ tags: value });
            }}
            onBlur={() => void flush()}
            anchor={anchor?.reference}
            onDiscard={() => {
              autosave.discard();
              router.push(back.href);
            }}
          />
          <PublishMenu
            kind={kind}
            visibility={visibility}
            publishedAt={publishedAt}
            save={flush}
            onPublished={(next, at) => {
              const posted = visibility === "private" && next !== "private";
              setVisibility(next);
              setPublishedAt(at);
              // Back where the note was started. Not router.push: the first
              // save's replaceState can still be settling in the router.
              if (posted && kind === "note" && back.afterPost) window.location.assign(back.href);
            }}
          />
        </div>
      </header>

      {failure.formError && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {failure.formError}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <div className={`mx-auto px-5 pb-48 sm:px-8 ${reflection ? "max-w-[46rem] pt-12 sm:pt-20" : "max-w-[40rem] pt-10 sm:pt-16"}`}>
            {reflection && (
              <>
                <textarea
                  ref={titleField}
                  value={title}
                  rows={1}
                  maxLength={MAX_ITEM_TITLE_LENGTH}
                  placeholder="Title"
                  aria-label="Title"
                  aria-invalid={errors.title ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\n/g, " ");
                    setTitle(value);
                    change({ title: value });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || (event.key === "ArrowDown" && !event.shiftKey)) {
                      event.preventDefault();
                      editor?.commands.focus("start");
                    }
                  }}
                  onBlur={() => void flush()}
                  className="post-title"
                />
                {errors.title && (
                  <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
                    {errors.title}
                  </p>
                )}
              </>
            )}

            {anchor && (
              <figure data-note-anchor={anchor.reference} className="passage-block mb-8">
                {anchor.passage?.ok ? (
                  <>
                    <blockquote>
                      <PassageQuote ranges={anchor.passage.verses} />
                    </blockquote>
                    <figcaption className="mt-2 flex gap-2 text-sm text-stone-600 dark:text-stone-400">
                      <span className="font-medium text-stone-900 dark:text-stone-100">{anchor.passage.reference}</span>
                      <span>{anchor.passage.translation.abbrev}</span>
                    </figcaption>
                    <div className="mt-1">
                      <Attribution translation={anchor.passage.translation} />
                    </div>
                  </>
                ) : (
                  <figcaption className="text-sm font-medium">{anchor.reference}</figcaption>
                )}
              </figure>
            )}

            <div className={reflection ? "mt-6" : ""}>
              <EditorContent editor={editor} />
              {!editor && (
                // Until the editor is ready: the text, unformatted, so the page is not empty.
                <div aria-hidden="true" className="post-prose whitespace-pre-wrap text-stone-400">
                  {props.saved.markdown.replace(/^\[\[.*\]\][ \t]*$/gm, "").trim()}
                </div>
              )}
            </div>
            {errors.markdown && (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
                {errors.markdown}
              </p>
            )}
          </div>
        </main>

        {showStudy && narrow && (
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-stone-900/30" onClick={() => setSheetOpen(false)} />
        )}
        <aside
          id="study-sidebar"
          aria-label="Study sidebar"
          hidden={!showStudy}
          className={
            narrow
              ? "fixed inset-x-0 bottom-0 z-50 h-[85vh] overflow-hidden rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950"
              : "sticky top-14 h-[calc(100vh-3.5rem)] w-[25rem] shrink-0 overflow-hidden border-l border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40"
          }
        >
          <StudySidebar
            bridge={bridge}
            tab={tab}
            onTab={setTab}
            sheet={narrow}
            onClose={() => setSheetOpen(false)}
            onTranslation={(id) => {
              study.current.translationId = id;
            }}
          />
        </aside>
      </div>

      {editor && (
        <>
          <SelectionToolbar editor={editor} headings={reflection} />
          {reflection && <InsertButton editor={editor} />}
        </>
      )}
      <SlashMenu state={slash.state} index={slash.index} onHover={slash.setIndex} />
      {imagePrompt && (
        <form
          onSubmit={submitImage}
          aria-label="Image"
          className="editor-popover fixed z-50 w-80 space-y-2"
          style={{ left: Math.max(8, Math.min(imagePrompt.left, window.innerWidth - 328)), top: imagePrompt.top }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setImagePrompt(null);
              editor?.commands.focus();
            }
          }}
        >
          <input
            name="src"
            type="url"
            required
            autoFocus
            placeholder="https://… the image’s address"
            aria-label="Image address"
            className="h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <input
            name="alt"
            type="text"
            placeholder="What it shows (for those who cannot see it)"
            aria-label="Image description"
            className="h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setImagePrompt(null)} className={barButton}>
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 cursor-pointer rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 dark:bg-stone-100 dark:text-stone-900"
            >
              Insert image
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
