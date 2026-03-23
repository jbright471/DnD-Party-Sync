import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { CharacterCard } from '../components/CharacterCard';
import { Upload, FileText, AlertCircle, Check, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Character } from '../types/character';
import socket from '../socket';

export default function CharacterImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file exported from D&D Beyond.');
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await fetch('/api/characters/import/pdf', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Import failed');
      }

      const data = await res.json();
      setPreview(data);
      toast.success('Character data extracted successfully!');
    } catch (err: any) {
      console.error('PDF parse error:', err);
      setError(err?.message || "Failed to parse PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDone = () => {
    socket.emit('refresh_party');
    toast.success(`${preview.name} imported successfully!`);
    navigate('/party');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <FileText className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-display tracking-wider">Import from D&D Beyond</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Upload Character Sheet PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Export your character sheet from D&D Beyond as a PDF, then upload it here.</p>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isProcessing
                ? 'border-primary/50 bg-primary/5 cursor-wait'
                : isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border cursor-pointer hover:border-primary/50'
            }`}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-lg font-display">Analyzing character sheet...</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-display">
                  {fileName ? fileName : 'Click to select PDF file'}
                </p>
              </>
            )}
            <Input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-3">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Check className="h-5 w-5 text-health" />
                Imported: {preview.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Character has been successfully saved to the database.
              </p>
            </CardContent>
          </Card>

          <Button onClick={handleDone} size="lg" className="w-full font-display tracking-wider text-lg h-12">
            <Check className="mr-2 h-5 w-5" />
            Go to Party Lobby
          </Button>
        </>
      )}
    </div>
  );
}
