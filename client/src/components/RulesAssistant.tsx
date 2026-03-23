import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, X, BookOpen } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function RulesAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hail, adventurer. What rules of the weave do you seek to clarify?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg })
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || 'Error occurred. DM intervention required.'
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'The weave is distorted. Connection to Ollama failed.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Ask the Rules Sage"
        className="fixed bottom-6 right-[72px] w-12 h-12 rounded-full bg-card border-2 border-primary/70 text-primary cursor-pointer shadow-lg shadow-black/50 flex items-center justify-center z-[100] transition-all duration-200 hover:scale-110 hover:border-primary hover:shadow-primary/20"
      >
        🧙
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 w-[340px] h-[480px] bg-card border border-border rounded-xl shadow-2xl shadow-black/60 flex flex-col z-[100] overflow-hidden">
      {/* Header */}
      <div className="bg-secondary/30 border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-bold">Rules Sage</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-background/50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'self-end bg-primary/15 border border-primary/30 text-primary ml-auto rounded-br-sm'
                : 'self-start bg-secondary/50 border border-border text-foreground/90 rounded-bl-sm'
            }`}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="self-start text-xs text-muted-foreground italic animate-pulse px-2">
            Consulting the tomes...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="border-t border-border p-2.5 flex gap-2 bg-secondary/20 shrink-0">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about a spell or rule..."
          disabled={isLoading}
          className="flex-1 h-8 text-xs bg-background/50"
        />
        <Button type="submit" size="icon" className="h-8 w-8" disabled={!input.trim() || isLoading}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
