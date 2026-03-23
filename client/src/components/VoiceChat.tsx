import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { toast } from 'sonner';
import socket from '../socket';

interface VoicePeer {
  socketId: string;
  characterId: number | null;
  playerName: string;
  isSpeaking: boolean;
  volume: number; // 0-100
  stream?: MediaStream;
}

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const SPEAKING_THRESHOLD = 20; // RMS amplitude threshold (0-255)
const SPEAKING_CHECK_MS = 100;

export function VoiceChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [inVoice, setInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const createPeerConnection = useCallback((remoteSocketId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('voice_ice_candidate', { to: remoteSocketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      setPeers(prev => prev.map(p => p.socketId === remoteSocketId ? { ...p, stream } : p));

      let audio = audioElementsRef.current.get(remoteSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElementsRef.current.set(remoteSocketId, audio);
      }
      audio.srcObject = stream;
      audio.volume = (peers.find(p => p.socketId === remoteSocketId)?.volume ?? 80) / 100;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        peerConnectionsRef.current.delete(remoteSocketId);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track =>
        pc.addTrack(track, localStreamRef.current!)
      );
    }

    peerConnectionsRef.current.set(remoteSocketId, pc);
    return pc;
  }, [peers]);

  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      speakingTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
        const speaking = rms > SPEAKING_THRESHOLD;
        setIsSpeaking(speaking);
        socket.emit('voice_speaking', { speaking });
      }, SPEAKING_CHECK_MS);
    } catch {
      // AudioContext may be blocked in some environments — non-fatal
    }
  }, []);

  const joinVoice = useCallback(async (playerName = 'Adventurer', characterId: number | null = null) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      startSpeakingDetection(stream);
      socket.emit('voice_join', { playerName, characterId });
      setInVoice(true);
      toast.success('Joined the voice channel.');
    } catch {
      toast.error('Microphone access denied. Check browser permissions.');
    }
  }, [startSpeakingDetection]);

  const leaveVoice = useCallback(() => {
    // Tear down all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    // Stop audio elements
    audioElementsRef.current.forEach(el => { el.srcObject = null; el.remove(); });
    audioElementsRef.current.clear();

    // Stop local tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Stop speaking detection
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    analyserRef.current = null;

    socket.emit('voice_leave');
    setInVoice(false);
    setIsSpeaking(false);
    setPeers([]);
    toast('Left the voice channel.');
  }, []);

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const muted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !muted; });
    setIsMuted(muted);
    socket.emit('voice_speaking', { speaking: false });
  };

  const toggleDeafen = () => {
    const deafened = !isDeafened;
    audioElementsRef.current.forEach(el => { el.muted = deafened; });
    setIsDeafened(deafened);
  };

  const setPeerVolume = (socketId: string, volume: number) => {
    setPeers(prev => prev.map(p => p.socketId === socketId ? { ...p, volume } : p));
    const audio = audioElementsRef.current.get(socketId);
    if (audio) audio.volume = volume / 100;
  };

  // ── Socket event handlers ──
  useEffect(() => {
    socket.on('voice_room_state', (roomPeers: Omit<VoicePeer, 'isSpeaking' | 'volume'>[]) => {
      setPeers(prev => {
        const myId = socket.id;
        return roomPeers
          .filter(p => p.socketId !== myId)
          .map(p => ({
            ...p,
            isSpeaking: prev.find(e => e.socketId === p.socketId)?.isSpeaking ?? false,
            volume: prev.find(e => e.socketId === p.socketId)?.volume ?? 80,
          }));
      });
    });

    socket.on('voice_existing_peers', async (existingPeers: { socketId: string; playerName: string; characterId: number | null }[]) => {
      for (const peer of existingPeers) {
        setPeers(prev =>
          prev.find(p => p.socketId === peer.socketId)
            ? prev
            : [...prev, { ...peer, isSpeaking: false, volume: 80 }]
        );
        const pc = createPeerConnection(peer.socketId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice_offer', { to: peer.socketId, offer });
      }
    });

    socket.on('voice_peer_joined', (peer: { socketId: string; playerName: string; characterId: number | null }) => {
      setPeers(prev =>
        prev.find(p => p.socketId === peer.socketId)
          ? prev
          : [...prev, { ...peer, isSpeaking: false, volume: 80 }]
      );
    });

    socket.on('voice_peer_left', ({ socketId }: { socketId: string }) => {
      peerConnectionsRef.current.get(socketId)?.close();
      peerConnectionsRef.current.delete(socketId);
      const audio = audioElementsRef.current.get(socketId);
      if (audio) { audio.srcObject = null; }
      audioElementsRef.current.delete(socketId);
      setPeers(prev => prev.filter(p => p.socketId !== socketId));
    });

    socket.on('voice_offer', async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice_answer', { to: from, answer });
    });

    socket.on('voice_answer', async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('voice_ice_candidate', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* non-fatal */ }
      }
    });

    socket.on('voice_peer_speaking', ({ socketId, speaking }: { socketId: string; speaking: boolean }) => {
      setPeers(prev => prev.map(p => p.socketId === socketId ? { ...p, isSpeaking: speaking } : p));
    });

    return () => {
      socket.off('voice_room_state');
      socket.off('voice_existing_peers');
      socket.off('voice_peer_joined');
      socket.off('voice_peer_left');
      socket.off('voice_offer');
      socket.off('voice_answer');
      socket.off('voice_ice_candidate');
      socket.off('voice_peer_speaking');
    };
  }, [createPeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (inVoice) leaveVoice(); };
  }, [inVoice, leaveVoice]);

  const totalInVoice = peers.length + (inVoice ? 1 : 0);

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
      {/* ── Expanded panel ── */}
      {isOpen && (
        <div className="w-64 rounded-xl border border-primary/20 bg-background/95 backdrop-blur shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-secondary/10">
            <div className={`h-2 w-2 rounded-full ${inVoice ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span className="text-xs font-semibold text-foreground/80">Voice Channel</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{totalInVoice} connected</span>
          </div>

          {/* Participants */}
          <div className="px-2 py-2 space-y-1 max-h-48 overflow-y-auto">
            {/* Local user */}
            {inVoice && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5">
                <div className={`h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 transition-all ${isSpeaking && !isMuted ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-background' : ''}`}>
                  <span className="text-[9px] font-bold text-primary">YOU</span>
                </div>
                <span className="text-xs text-foreground/80 flex-1 truncate">You</span>
                {isMuted && <MicOff className="h-3 w-3 text-red-400" />}
                {!isMuted && isSpeaking && <Volume2 className="h-3 w-3 text-green-400 animate-pulse" />}
              </div>
            )}

            {/* Remote peers */}
            {peers.map(peer => (
              <div key={peer.socketId} className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/20 transition-colors">
                  <div className={`h-6 w-6 rounded-full bg-secondary/30 flex items-center justify-center shrink-0 transition-all ${peer.isSpeaking ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-background' : ''}`}>
                    <span className="text-[8px] font-bold text-muted-foreground">
                      {peer.playerName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-foreground/80 flex-1 truncate">{peer.playerName}</span>
                  {peer.isSpeaking && <Volume2 className="h-3 w-3 text-green-400 animate-pulse" />}
                </div>
                {!isDeafened && (
                  <div className="flex items-center gap-2 px-2">
                    <VolumeX className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    <Slider
                      value={[peer.volume]}
                      onValueChange={([v]) => setPeerVolume(peer.socketId, v)}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1 h-1"
                    />
                    <Volume2 className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  </div>
                )}
              </div>
            ))}

            {!inVoice && peers.length === 0 && (
              <p className="text-[10px] text-muted-foreground/50 italic text-center py-3">
                No one in voice yet
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-1 px-2 pb-2 pt-1 border-t border-border/40">
            {inVoice ? (
              <>
                <Button
                  size="sm"
                  variant={isMuted ? 'destructive' : 'outline'}
                  className="flex-1 h-7 text-xs"
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="h-3 w-3 mr-1" /> : <Mic className="h-3 w-3 mr-1" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  size="sm"
                  variant={isDeafened ? 'destructive' : 'outline'}
                  className="h-7 w-8 p-0"
                  onClick={toggleDeafen}
                  title={isDeafened ? 'Undeafen' : 'Deafen'}
                >
                  {isDeafened ? <HeadphoneOff className="h-3 w-3" /> : <Headphones className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 w-8 p-0"
                  onClick={leaveVoice}
                  title="Leave voice"
                >
                  <PhoneOff className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={() => joinVoice()}
              >
                <Phone className="h-3 w-3 mr-1" /> Join Voice
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`
          h-12 w-12 rounded-full shadow-lg border-2 flex items-center justify-center
          transition-all duration-200 hover:scale-110 relative
          ${inVoice
            ? 'bg-green-600 border-green-400 text-white'
            : 'bg-background border-primary/30 text-primary hover:border-primary'
          }
        `}
        title="Voice Chat"
      >
        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {inVoice && isSpeaking && !isMuted && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 animate-ping" />
        )}
        {totalInVoice > 0 && (
          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
            {totalInVoice}
          </span>
        )}
      </button>
    </div>
  );
}
