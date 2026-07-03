'use client';

import React, { useEffect, useRef } from 'react';
import EditorJS, { OutputData } from '@editorjs/editorjs';

interface EditorProps {
  initialData?: OutputData;
  onChange: (data: OutputData) => void;
}

export default function Editor({ initialData, onChange }: EditorProps) {
  const ejInstance = useRef<EditorJS | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initEditor = async () => {
      const Header = (await import('@editorjs/header')).default;
      const List = (await import('@editorjs/list')).default;
      const Paragraph = (await import('@editorjs/paragraph')).default;
      const Quote = (await import('@editorjs/quote')).default;
      const Table = (await import('@editorjs/table')).default;
      const Warning = (await import('@editorjs/warning')).default;
      const Marker = (await import('@editorjs/marker')).default;
      const InlineCode = (await import('@editorjs/inline-code')).default;
      const Delimiter = (await import('@editorjs/delimiter')).default;
      const Image = (await import('@editorjs/image')).default;
      const Code = (await import('@editorjs/code')).default;

      if (!editorRef.current || ejInstance.current) return;

      const editor = new EditorJS({
        holder: editorRef.current,
        data: initialData,
        onChange: async () => {
          if (ejInstance.current) {
            const data = await ejInstance.current.save();
            onChange(data);
          }
        },
        tools: {
          header: Header,
          list: List,
          paragraph: Paragraph,
          quote: Quote,
          table: Table,
          warning: Warning,
          marker: Marker,
          inlineCode: InlineCode,
          delimiter: Delimiter,
          image: {
            class: Image,
            config: {
              endpoints: {
                byFile: '/api/uploadFile',
                byUrl: '/api/fetchUrl',
              }
            }
          },
          code: Code,
        },
        placeholder: 'Start writing your wiki article here...',
        autofocus: true,
      });

      ejInstance.current = editor;
    };

    void initEditor();

    return () => {
      if (ejInstance.current && ejInstance.current.destroy) {
        ejInstance.current.destroy();
        ejInstance.current = null;
      }
    };
  }, [initialData, onChange]);

  return (
    <div className="editor-container" ref={editorRef} />
  );
}
