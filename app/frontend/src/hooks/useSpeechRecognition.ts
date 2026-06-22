import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported] = useState(() => !!getSpeechRecognition());
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef('');
  const intentionalStopRef = useRef(false);
  const sessionRef = useRef(0);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
  }, []);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    sessionRef.current++;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const mySession = ++sessionRef.current;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (mySession !== sessionRef.current) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) {
          finalTranscriptRef.current += result[0]!.transcript;
        } else {
          interim += result[0]!.transcript;
        }
      }
      setTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (mySession !== sessionRef.current) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        intentionalStopRef.current = true;
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      if (intentionalStopRef.current || mySession !== sessionRef.current) {
        setIsListening(false);
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        return;
      }
      try {
        startRecognition();
      } catch {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, []);

  const start = useCallback((existingText?: string) => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    if (existingText !== undefined && existingText.length > 0) {
      if (!existingText.endsWith(' ')) {
        finalTranscriptRef.current = existingText + ' ';
      } else {
        finalTranscriptRef.current = existingText;
      }
    }

    intentionalStopRef.current = false;
    setIsListening(true);
    startRecognition();
  }, [startRecognition]);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      sessionRef.current++;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isSupported, isListening, transcript, start, stop, resetTranscript };
}
