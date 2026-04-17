'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const GREETING = '¡Hola! Soy Lucy. ¿En qué te puedo ayudar hoy? Puedo cambiar alimentos de tu plan, sugerirte snacks, darte recetas, o responder cualquier pregunta sobre tu alimentación.'

export default function ChatPanel({ onDataChange }: { onDataChange?: () => void }) {
  const { user, session } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revertDataRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [showHint, setShowHint] = useState(false)
  const [tieneNoLeidos, setTieneNoLeidos] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const historyLoaded = useRef(false)

  // Get userId from session (independent of useAuth timing)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
    })
  }, [])

  // Load chat history when panel opens for the first time
  const loadHistory = useCallback(async () => {
    if (historyLoaded.current || !user) return
    historyLoaded.current = true

    try {
      // Get the last 20 messages (order desc to get newest, then reverse for display)
      const { data, error } = await supabase
        .from('conversaciones')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Error loading chat history:', error.message)
        setMessages([{ role: 'assistant', content: GREETING }])
        return
      }

      if (data && data.length > 0) {
        // Reverse to get chronological order (oldest first)
        setMessages(data.reverse().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })))
      } else {
        setMessages([{ role: 'assistant', content: GREETING }])
      }
    } catch (err) {
      console.error('Chat history fetch failed:', err)
      historyLoaded.current = false // Allow retry
      setMessages([{ role: 'assistant', content: GREETING }])
    }
  }, [user])

  // Check for unread messages
  const checkNoLeidos = useCallback(async () => {
    if (!userId) return
    const { count } = await supabase
      .from('conversaciones')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .eq('leido', false)
    setTieneNoLeidos((count ?? 0) > 0)
  }, [userId])

  // Check on mount + when userId becomes available
  useEffect(() => {
    checkNoLeidos()
  }, [checkNoLeidos])

  useEffect(() => {
    if (open) {
      loadHistory()
      // Mark ALL unread messages as read when chat opens (don't gate on tieneNoLeidos)
      if (userId) {
        supabase
          .from('conversaciones')
          .update({ leido: true })
          .eq('user_id', userId)
          .eq('role', 'assistant')
          .eq('leido', false)
          .then(() => setTieneNoLeidos(false))
      }
    } else if (userId) {
      // Re-check for unread when chat closes
      checkNoLeidos()
    }
  }, [open, loadHistory, userId, checkNoLeidos])

  // Show badge every time component mounts
  useEffect(() => {
    setShowHint(true)
    const timer = setTimeout(() => setShowHint(false), 5000)
    return () => clearTimeout(timer)
  }, [])

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
          clientTime: new Date().toISOString(),
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error. Intenta de nuevo.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
        if (data.revertData !== undefined) {
          revertDataRef.current = data.revertData
        }
        // Refresh calendar when Lucy confirms a change
        const text = (data.response || '').toLowerCase()
        const madeChange = /✅|listo|cambié|reemplacé|añadí|eliminé|actualicé|modifiqué|puse|quité|reduje|aumenté|moví|ajusté|guardé|revertí|deshice|regresé|restauré|volví|de vuelta|recuperé|lo dejé como|lo regresé|reverted|undone|restored/.test(text)
        if (onDataChange && madeChange) {
          // Double refresh: immediate + delayed to catch DB propagation
          onDataChange()
          setTimeout(() => onDataChange(), 1500)
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
      <div className="fixed bottom-24 right-4 z-20">
        {/* Badge */}
        {showHint && (
          <div className="absolute -top-9 right-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] text-white animate-badgeFade" style={{ backgroundColor: '#2D2B45' }}>
            ¡Pregúntame!
            <div className="absolute -bottom-1 right-5 w-2 h-2 rotate-45" style={{ backgroundColor: '#2D2B45' }} />
          </div>
        )}

        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-full animate-lucyPulse" style={{ backgroundColor: '#B8B5E0' }} />

        <button
          onClick={() => { setOpen(true); setShowHint(false) }}
          className="relative w-16 h-16 rounded-full bg-lucy-accent flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          <span className="font-logo text-white text-xl">L</span>
          {tieneNoLeidos && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      </div>

      <style jsx>{`
        @keyframes lucyPulse {
          0% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .animate-lucyPulse {
          animation: lucyPulse 3s ease-out infinite;
        }
        @keyframes badgeFade {
          0% { opacity: 0; transform: translateY(4px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(4px); }
        }
        .animate-badgeFade {
          animation: badgeFade 5s ease-in-out forwards;
        }
      `}</style>

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
                <p className="text-[10px] text-lucy-muted">Tu asistente nutricional personal</p>
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
