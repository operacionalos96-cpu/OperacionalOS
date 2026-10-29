"use client"

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
  WandSparklesIcon,
} from "lucide-react"
import { useRef } from "react"
import { convertMarkdownInHtml, looksLikeMarkdown, markdownToHtml, toNoteHtml } from "@/lib/domain/rich-text"
import { cn } from "@/lib/utils"

const httpOnly = (url: string) => /^https?:\/\//i.test(url)

/**
 * Texto formatado (negrito, títulos, listas, checklist, citação, link, código).
 * Guarda HTML, mas só o que o editor conhece: script/estilo colados são descartados.
 * Atalhos: Ctrl+B, Ctrl+I, Ctrl+U, "## " título, "- " lista, "[] " checklist, "> " citação.
 */
export function RichTextEditor({ value, onChange, placeholder, className }: { value: string; onChange: (html: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<Editor | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: true,
          autolink: true,
          protocols: ["http", "https"],
          isAllowedUri: (url) => httpOnly(url),
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Escreva aqui…" }),
    ],
    content: toNoteHtml(value),
    editorProps: {
      attributes: { class: "rich-text min-h-48 outline-none", "aria-label": "Texto da nota" },
      // Markdown colado (ChatGPT, Notion…) já entra formatado. Se o que veio já é texto formatado, deixa o editor cuidar.
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? ""
        const html = event.clipboardData?.getData("text/html") ?? ""
        if (/<(strong|b|em|h[1-6]|ul|ol|li|blockquote)\b/i.test(html) || !looksLikeMarkdown(text)) return false
        ref.current?.commands.insertContent(markdownToHtml(text))
        return true
      },
    },
    onCreate: ({ editor }) => {
      ref.current = editor
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  })

  return (
    <div className={cn("grid grid-rows-[auto_1fr] content-start gap-2", className)}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      markdown: looksLikeMarkdown(e.getText({ blockSeparator: "\n" })),
    }),
  })
  const c = () => editor.chain().focus()

  function link() {
    if (s.link) return c().unsetLink().run()
    const url = window.prompt("Link (https://…)")?.trim()
    if (!url) return
    const full = httpOnly(url) ? url : `https://${url}`
    c().extendMarkRange("link").setLink({ href: full }).run()
  }

  const groups: { label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; run: () => void }[][] = [
    [
      { label: "Negrito (Ctrl+B)", icon: BoldIcon, active: s.bold, run: () => c().toggleBold().run() },
      { label: "Itálico (Ctrl+I)", icon: ItalicIcon, active: s.italic, run: () => c().toggleItalic().run() },
      { label: "Sublinhado (Ctrl+U)", icon: UnderlineIcon, active: s.underline, run: () => c().toggleUnderline().run() },
      { label: "Riscado", icon: StrikethroughIcon, active: s.strike, run: () => c().toggleStrike().run() },
    ],
    [
      { label: "Título", icon: Heading2Icon, active: s.h2, run: () => c().toggleHeading({ level: 2 }).run() },
      { label: "Subtítulo", icon: Heading3Icon, active: s.h3, run: () => c().toggleHeading({ level: 3 }).run() },
    ],
    [
      { label: "Lista", icon: ListIcon, active: s.bullet, run: () => c().toggleBulletList().run() },
      { label: "Lista numerada", icon: ListOrderedIcon, active: s.ordered, run: () => c().toggleOrderedList().run() },
      { label: "Checklist", icon: ListChecksIcon, active: s.task, run: () => c().toggleTaskList().run() },
    ],
    [
      { label: "Citação", icon: QuoteIcon, active: s.quote, run: () => c().toggleBlockquote().run() },
      { label: "Código", icon: CodeIcon, active: s.code, run: () => c().toggleCodeBlock().run() },
      { label: s.link ? "Tirar link" : "Link", icon: LinkIcon, active: s.link, run: link },
    ],
  ]

  const convert = () => editor.commands.setContent(convertMarkdownInHtml(editor.getHTML()), { emitUpdate: true })

  return (
    <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-0.5 rounded-lg border bg-card/95 p-1 backdrop-blur" role="toolbar" aria-label="Formatação">
      {groups.map((g, i) => (
        <div key={i} className={cn("flex gap-0.5", i > 0 && "border-l pl-1")}>
          {g.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.label}
              aria-label={b.label}
              aria-pressed={b.active}
              onMouseDown={(e) => e.preventDefault()} // não tira o foco do texto
              onClick={b.run}
              className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", b.active && "bg-accent text-foreground")}
            >
              <b.icon className="size-4" />
            </button>
          ))}
        </div>
      ))}
      {s.markdown && (
        <button
          type="button"
          onClick={convert}
          title="Transforma ##, **negrito**, --- etc. em formatação"
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-brand/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <WandSparklesIcon className="size-3.5 text-brand" /> Converter Markdown
        </button>
      )}
    </div>
  )
}
