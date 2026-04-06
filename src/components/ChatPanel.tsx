'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '@/context/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const GREETING = '¡Hola! Soy Lucy. ¿En qué te puedo ayudar hoy? Puedo cambiar alimentos de tu plan, sugerirte snacks, darte recetas, o responder cualquier pregunta sobre tu alimentación.'

export default function ChatPanel({ onDataChange }: { onDataChange?: () => void }) {
  const { user, session } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revertDataRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, typing])

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [open])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || typing || !user || !session) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setTyping(true)

    try {
      // Send only role/content pairs (exclude the initial greeting for API)
      const apiMessages = newMessages.filter((_, i) => i > 0 || newMessages[0].role === 'user')
        .map(m => ({ role: m.role, content: m.content }))

      // If the first message was the greeting, start from user messages
      const toSend = apiMessages.length > 0 ? apiMessages : [{ role: 'user', content: text }]

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          accessToken: session.access_token,
          messages: toSend,
          lastRevertData: revertDataRef.current,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error. Intenta de nuevo.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
        if (data.revertData !== undefined) {
          revertDataRef.current = data.revertData
          onDataChange?.()
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión. Verifica tu internet.' }])
    }

    setTyping(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 w-12 h-12 rounded-full bg-lucy-accent flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity z-20"
      >
        <span className="font-logo text-white text-lg">L</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-30 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '80vh' }}
      >
        <div className="h-full bg-lucy-white rounded-t-[20px] border-t border-lucy-border flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-lucy-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-lucy-accent flex items-center justify-center">
                <span className="font-logo text-white text-sm">L</span>
              </div>
              <div>
                <p className="text-sm font-medium text-lucy-text">Lucy</p>
                <p className="text-[10px] text-lucy-muted">Tu nutricionista personal</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lucy-bg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="#9896B0" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-lucy-accent text-white rounded-br-md'
                      : 'rounded-bl-md text-lucy-text'
                  }`}
                  style={msg.role === 'assistant' ? { backgroundColor: '#F0EFFA' } : undefined}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-medium">{children}</strong>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 last:mb-0">{children}</ul>,
                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5" style={{ backgroundColor: '#F0EFFA' }}>
                  <span className="w-2 h-2 rounded-full bg-lucy-soft animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-lucy-soft animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-lucy-soft animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-lucy-border shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                className="flex-1 border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || typing}
                className="w-10 h-10 shrink-0 rounded-btn bg-lucy-accent flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
