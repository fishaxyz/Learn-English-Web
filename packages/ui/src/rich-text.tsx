import type { ReactNode } from "react";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

/** Defence in depth: the API already rejects other protocols, but the renderer never trusts its input. */
function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol) ? value : null;
  } catch {
    return null;
  }
}

export type RenderTerm = (senseRevisionId: string, children: ReactNode, key: string) => ReactNode;

/** Names shown instead of a conversation's "HOST1:" / "HOST2:" labels. */
export type SpeakerNames = { host1?: string | null; host2?: string | null } | null;

const HOST_PREFIX = /^\s*HOST\s?([12])\s*:\s*/i;

/**
 * A conversation turn ("HOST1: Hi!") shows the host's name instead of the label. The label stays in the page,
 * hidden, so code-point offsets into the block (vocabulary links, read-along timings) still line up; the name is
 * marked data-extra so offset counting skips it.
 */
function speakerTurn(node: Node, speakers: SpeakerNames | undefined) {
  const first = node.content?.[0];
  if (node.type !== "paragraph" || first?.type !== "text" || !first.text) return null;
  const label = HOST_PREFIX.exec(first.text);
  if (!label) return null;
  const host = label[1] === "1" ? 1 : 2;
  const name = (host === 1 ? speakers?.host1 : speakers?.host2) || `Host ${host}`;
  return {
    host,
    name,
    label: label[0],
    rest: {
      ...node,
      content: [{ ...first, text: first.text.slice(label[0].length) }, ...(node.content ?? []).slice(1)],
    },
  };
}

function renderText(node: Node, key: string, renderTerm?: RenderTerm): ReactNode {
  let out: ReactNode = node.text ?? "";
  for (const [i, mark] of (node.marks ?? []).entries()) {
    const k = `${key}-m${i}`;
    if (mark.type === "bold") out = <strong key={k}>{out}</strong>;
    else if (mark.type === "italic") out = <em key={k}>{out}</em>;
    else if (mark.type === "link") {
      const href = safeHref(mark.attrs?.["href"]);
      if (href) {
        out = (
          <a key={k} href={href} rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {out}
          </a>
        );
      }
    } else if (mark.type === "lexical") {
      const id = mark.attrs?.["senseRevisionId"];
      if (typeof id === "string" && renderTerm) out = renderTerm(id, out, k);
    }
  }
  return out;
}

function renderNode(node: Node, key: string, renderTerm?: RenderTerm, speakers?: SpeakerNames): ReactNode {
  const id = typeof node.attrs?.["id"] === "string" ? (node.attrs["id"] as string) : undefined;
  const turn = speakerTurn(node, speakers);
  if (turn) {
    return (
      <p key={key} data-block-id={id} className={`turn turn-host-${turn.host}`}>
        <span hidden>{turn.label}</span>
        <span data-extra="" className="speaker-name">
          {turn.name}
          <span className="sr-only">:</span>
        </span>{" "}
        {(turn.rest.content ?? []).map((child, i) => renderNode(child, `${key}-${i}`, renderTerm, speakers))}
      </p>
    );
  }
  const children = (node.content ?? []).map((child, i) => renderNode(child, `${key}-${i}`, renderTerm, speakers));
  switch (node.type) {
    case "text":
      return renderText(node, key, renderTerm);
    case "paragraph":
      return (
        <p key={key} data-block-id={id}>
          {children}
        </p>
      );
    case "heading": {
      const level = node.attrs?.["level"];
      const Tag = level === 3 ? "h3" : level === 4 ? "h4" : "h2";
      return (
        <Tag key={key} data-block-id={id}>
          {children}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} data-block-id={id}>
          {children}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul key={key} data-block-id={id}>
          {children}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} data-block-id={id}>
          {children}
        </ol>
      );
    case "listItem":
      return (
        <li key={key} data-block-id={id}>
          {children}
        </li>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    default:
      // Unknown nodes render as nothing: never as raw markup.
      return null;
  }
}

/**
 * Renders a stored rich-text document (Tiptap JSON) as React elements: no HTML strings, so nothing in the
 * document can run as code. `renderTerm` turns vocabulary links into pop-ups; without it they're plain text.
 */
export function RichTextRenderer({
  doc,
  renderTerm,
  speakers,
}: {
  doc: unknown;
  renderTerm?: RenderTerm;
  /** For conversations: who HOST1 and HOST2 are. */
  speakers?: SpeakerNames;
}) {
  const root = doc as Node | null;
  if (!root || root.type !== "doc" || !Array.isArray(root.content)) return null;
  return <div className="rich-text">{root.content.map((n, i) => renderNode(n, `b${i}`, renderTerm, speakers))}</div>;
}
