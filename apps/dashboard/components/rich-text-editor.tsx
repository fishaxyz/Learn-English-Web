"use client";

import type { SenseCardFragment } from "@english/graphql";
import { Extension, Mark, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, useTransition } from "react";

const BLOCKS = ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem"];

const newBlockId = () => `b${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

/**
 * Every block gets a permanent id (AGENTS.md §5.2: vocabulary links and transcripts point at blocks). Splitting
 * a paragraph copies its id, so duplicates are given fresh ids as soon as they appear.
 */
const BlockIds = Extension.create({
  name: "blockIds",
  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-block-id"),
            renderHTML: (attrs) => (attrs["id"] ? { "data-block-id": attrs["id"] } : {}),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _old, state) => {
          const seen = new Set<string>();
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (!BLOCKS.includes(node.type.name)) return;
            const id = node.attrs["id"] as string | null;
            if (!id || seen.has(id)) {
              const fresh = newBlockId();
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: fresh });
              seen.add(fresh);
              changed = true;
            } else seen.add(id);
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

/** A word or phrase linked to one exact, published sense revision: a vocabulary pop-up on the site. */
const Lexical = Mark.create({
  name: "lexical",
  inclusive: false,
  addAttributes() {
    return {
      senseRevisionId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-sense-revision-id"),
        renderHTML: (attrs) => ({ "data-sense-revision-id": attrs["senseRevisionId"] }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-sense-revision-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "lexical-link" }), 0],
});

/** ProseMirror needs at least one block: a new lesson starts with an empty paragraph. */
function startingContent(initial: unknown): JSONContent {
  const doc = initial as JSONContent | undefined;
  return doc?.type === "doc" && doc.content?.length ? doc : { type: "doc", content: [{ type: "paragraph" }] };
}

const EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && /^(https?:|mailto:)/i.test(url),
    },
  }),
  BlockIds,
  Lexical,
];

const EDITOR_PROPS = { attributes: { "aria-label": "Lesson text", class: "font-reading text-lg leading-relaxed" } };

type SearchResult = { displayForm: string; senses: SenseCardFragment[] }[];

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="min-w-9 rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent-soft aria-pressed:bg-accent-soft aria-pressed:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * The lesson body editor. Produces the same Tiptap JSON the API validates and the site renders; unknown
 * formatting (code, strike-through, tables...) isn't offered, so it can't be produced.
 */
export function RichTextEditor({
  initial,
  editable,
  onChange,
  searchSenses,
  onSenseChosen,
}: {
  initial: unknown;
  editable: boolean;
  onChange: (doc: JSONContent) => void;
  searchSenses: (query: string) => Promise<SearchResult>;
  onSenseChosen: (sense: SenseCardFragment) => void;
}) {
  // Options must stay the same object-for-object between renders, or Tiptap keeps re-creating the editor.
  const [content] = useState(() => startingContent(initial));
  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editable,
      extensions: EXTENSIONS,
      content,
      editorProps: EDITOR_PROPS,
      onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    },
    [editable]
  );

  const [panel, setPanel] = useState<{ query: string; results: SearchResult | null } | null>(null);
  const [searching, startSearch] = useTransition();

  if (!editor) {
    return (
      <div className="editor-surface min-h-64 rounded-xl border border-line bg-surface p-5 text-muted">
        Loading the editor…
      </div>
    );
  }

  // Re-rendered on every transaction (shouldRerenderOnTransaction), so the toolbar reflects the selection.
  const flags = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    link: editor.isActive("link"),
    lexical: editor.isActive("lexical"),
    hasSelection: !editor.state.selection.empty,
    selected: editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " "),
  };

  const run = (query: string) =>
    startSearch(async () => {
      const results = await searchSenses(query);
      setPanel({ query, results });
    });

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      {editable ? (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-1 border-b border-line p-2"
        >
          <ToolbarButton label="Bold" active={flags.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            B
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={flags.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ToolbarButton
            label="Heading"
            active={flags.h2}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            label="Subheading"
            active={flags.h3}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            label="Bulleted list"
            active={flags.bullet}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={flags.ordered}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
          <ToolbarButton
            label={flags.link ? "Remove web link" : "Add web link"}
            active={flags.link}
            disabled={!flags.hasSelection && !flags.link}
            onClick={() => {
              if (flags.link) return editor.chain().focus().unsetLink().run();
              const href = window.prompt("Web address (https://…)");
              if (href) editor.chain().focus().setLink({ href: href.trim() }).run();
            }}
          >
            Link
          </ToolbarButton>
          <ToolbarButton
            label={flags.lexical ? "Remove vocabulary link" : "Link word to its meaning"}
            active={flags.lexical}
            disabled={!flags.hasSelection && !flags.lexical}
            onClick={() => {
              if (flags.lexical) return editor.chain().focus().extendMarkRange("lexical").unsetMark("lexical").run();
              const query = flags.selected.trim();
              setPanel({ query, results: null });
              run(query);
            }}
          >
            {flags.lexical ? "Unlink word" : "Link word"}
          </ToolbarButton>
        </div>
      ) : null}

      {panel ? (
        <div className="border-b border-line bg-paper p-3" role="region" aria-label="Link a word to its meaning">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(panel.query);
            }}
          >
            <label htmlFor="sense-search" className="text-sm font-medium">
              Find the word
            </label>
            <input
              id="sense-search"
              value={panel.query}
              onChange={(e) => setPanel({ ...panel, query: e.target.value })}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent">
              Search
            </button>
            <button type="button" onClick={() => setPanel(null)} className="ml-auto text-sm text-muted hover:underline">
              Close
            </button>
          </form>
          <div aria-live="polite" className="mt-2 text-sm">
            {searching ? <p className="text-muted">Searching…</p> : null}
            {!searching && panel.results?.length === 0 ? (
              <p className="text-muted">No published meanings found. Only published word senses can be linked.</p>
            ) : null}
            <ul className="mt-1 flex flex-col gap-1">
              {panel.results?.flatMap((entry) =>
                entry.senses.map((sense) => (
                  <li key={sense.revisionId}>
                    <button
                      type="button"
                      onClick={() => {
                        editor.chain().focus().setMark("lexical", { senseRevisionId: sense.revisionId }).run();
                        onSenseChosen(sense);
                        setPanel(null);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent-soft"
                    >
                      <span className="font-semibold">{entry.displayForm}</span>{" "}
                      <span className="italic text-muted">{sense.partOfSpeech}</span>
                      {sense.cefrLevel ? (
                        <span className="ml-1 text-xs font-semibold text-accent">{sense.cefrLevel}</span>
                      ) : null}
                      <span className="block text-muted">{sense.definition}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="editor-surface p-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
