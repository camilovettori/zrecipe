'use client'

import 'react-quill-new/dist/quill.snow.css'
import ReactQuill from 'react-quill-new'

const MODULES = {
  toolbar: [
    ['bold', 'italic'],
    [{ header: 2 }, { header: 3 }],
    [{ list: 'bullet' }, { list: 'ordered' }],
    ['link', 'image'],
    ['clean'],
  ],
}

const FORMATS = ['bold', 'italic', 'header', 'list', 'link', 'image']

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function QuillEditor({ value, onChange }: Props) {
  return (
    <div className="blog-editor-quill">
      <ReactQuill theme="snow" value={value} onChange={onChange} modules={MODULES} formats={FORMATS} />
    </div>
  )
}
