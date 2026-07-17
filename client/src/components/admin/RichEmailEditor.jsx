import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

// Rich text editor for admin email compose. Backed by TipTap so paste
// from Google Docs / Notion / other rich-text sources preserves
// formatting (bold, italic, links, lists, headings) into the outbound
// email HTML. The parent owns the HTML string state; this component
// syncs edits back via onChange and hydrates from `value` when the
// parent resets it (e.g., after a successful send clears the form).
export default function RichEmailEditor({ value, onChange, placeholder = 'Write your email here…' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Emails render better without code blocks / horizontal rules /
        // block quotes for our current use case — disable them so users
        // can't accidentally create markup that breaks in clients that
        // don't style them.
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  // Hydrate from parent when value is externally reset (e.g. after send
  // clears emailBody to ''). Skip when value already matches so cursor
  // stays put during normal editing.
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    // TipTap's default empty doc is <p></p> — treat empty parent value
    // as equivalent so we don't stomp during first render.
    const isEmpty = (v) => !v || v === '<p></p>'
    if (isEmpty(value) && isEmpty(current)) return
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rich-email-editor">
      <div className="flex flex-wrap items-center gap-1 mb-2 pb-2 border-b border-border">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="B"
          title="Bold (⌘B)"
          className="font-bold"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="I"
          title="Italic (⌘I)"
          className="italic"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          label="S"
          title="Strikethrough"
          className="line-through"
        />
        <span className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          label="H1"
          title="Heading 1"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="H2"
          title="Heading 2"
        />
        <span className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="• List"
          title="Bulleted list"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          label="1. List"
          title="Numbered list"
        />
        <span className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          onClick={() => {
            const previous = editor.getAttributes('link').href
            const url = window.prompt('Link URL', previous || 'https://')
            if (url === null) return
            if (url === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
          active={editor.isActive('link')}
          label="🔗"
          title="Link"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          label="✕"
          title="Clear formatting"
        />
      </div>
      <EditorContent
        editor={editor}
        className="prose-email min-h-[200px] max-h-[500px] overflow-y-auto text-sm text-text-primary"
      />
      <style>{`
        .rich-email-editor .ProseMirror {
          outline: none;
          min-height: 200px;
          padding: 4px 2px;
        }
        .rich-email-editor .ProseMirror p { margin: 0 0 0.75em; }
        .rich-email-editor .ProseMirror p:last-child { margin-bottom: 0; }
        .rich-email-editor .ProseMirror h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.4em; }
        .rich-email-editor .ProseMirror h2 { font-size: 1.25em; font-weight: 700; margin: 0.5em 0 0.4em; }
        .rich-email-editor .ProseMirror ul, .rich-email-editor .ProseMirror ol { padding-left: 1.25em; margin: 0 0 0.75em; }
        .rich-email-editor .ProseMirror li { margin: 0.15em 0; }
        .rich-email-editor .ProseMirror a { color: rgb(249 115 22); text-decoration: underline; }
        .rich-email-editor .ProseMirror strong { font-weight: 700; }
        .rich-email-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgb(115 115 115);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

function ToolbarButton({ onClick, active, label, title, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        active
          ? 'bg-accent/20 text-accent'
          : 'text-text-secondary hover:bg-bg-primary hover:text-text-primary'
      } ${className}`}
    >
      {label}
    </button>
  )
}
