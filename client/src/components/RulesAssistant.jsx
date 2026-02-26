import React, { useState, useRef, useEffect } from 'react';

export default function RulesAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hail, adventurer. What rules of the weave do you seek to clarify?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const res = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: userMsg })
            });
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.answer || 'Error occurred. DM intervention required.' }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'The weave is distorted. Connection to Ollama failed.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--dnd-surface)',
                    border: '2px solid var(--dnd-gold)',
                    color: 'var(--dnd-gold)',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100
                }}
                title="Ask the D&D Rules Assistant"
            >
                🧙‍♂️
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            width: '350px',
            height: '500px',
            background: 'var(--dnd-navy)',
            border: '1px solid var(--dnd-border)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                background: 'var(--dnd-surface)',
                padding: '0.75rem',
                borderBottom: '1px solid var(--dnd-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🧙‍♂️</span>
                    <h3 className="fantasy-heading" style={{ margin: 0, fontSize: '1rem' }}>Rules Sage</h3>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '1.2rem' }}
                >
                    ✕
                </button>
            </div>

            {/* Chat Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#0D1117' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        background: msg.role === 'user' ? 'rgba(212,160,23,0.15)' : 'rgba(33,38,45,0.8)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(212,160,23,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: msg.role === 'user' ? 'var(--dnd-gold)' : 'var(--dnd-text)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        borderBottomRightRadius: msg.role === 'user' ? '2px' : '8px',
                        borderBottomLeftRadius: msg.role === 'assistant' ? '2px' : '8px',
                        fontSize: '0.85rem',
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap'
                    }}>
                        {msg.content}
                    </div>
                ))}
                {isLoading && (
                    <div style={{
                        alignSelf: 'flex-start',
                        padding: '0.5rem 0.75rem',
                        color: 'var(--dnd-muted)',
                        fontSize: '0.8rem',
                        fontStyle: 'italic',
                        animation: 'pulse 1.5s infinite'
                    }}>
                        Consulting the tomes...
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} style={{
                padding: '0.75rem',
                borderTop: '1px solid var(--dnd-border)',
                background: 'var(--dnd-surface)',
                display: 'flex',
                gap: '0.5rem'
            }}>
                <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1, fontSize: '0.85rem' }}
                    placeholder="Ask about a spell or rule..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isLoading}
                />
                <button type="submit" className="btn-primary" disabled={!input.trim() || isLoading} style={{ padding: '0.5rem' }}>
                    Send
                </button>
            </form>
        </div>
    );
}
