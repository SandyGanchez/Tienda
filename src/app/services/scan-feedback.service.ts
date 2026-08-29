import { Injectable } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Injectable({ providedIn: 'root' })
export class ScanFeedbackService {
  private audioContext: AudioContext | null = null;

  async preparar(): Promise<void> {
    try {
      const context = this.obtenerAudioContext();
      if (context.state === 'suspended') await context.resume();
    } catch {
      // El feedback es opcional y nunca debe impedir el escaneo.
    }
  }

  async feedbackLecturaCorrecta(): Promise<void> {
    await Promise.all([this.reproducirBeep().catch(() => undefined), this.vibrar().catch(() => undefined)]);
  }

  private obtenerAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private async reproducirBeep(): Promise<void> {
    const context = this.obtenerAudioContext();
    if (context.state === 'suspended') await context.resume();

    const inicio = context.currentTime;
    const fin = inicio + 0.11;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1150, inicio);
    gain.gain.setValueAtTime(0.0001, inicio);
    gain.gain.exponentialRampToValueAtTime(0.1, inicio + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, fin);
    oscillator.connect(gain);
    gain.connect(context.destination);

    await new Promise<void>((resolve) => {
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        resolve();
      };
      oscillator.start(inicio);
      oscillator.stop(fin);
    });
  }

  private async vibrar(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      try {
        navigator.vibrate?.(40);
      } catch {
        // Algunos navegadores y WebViews no ofrecen vibración.
      }
    }
  }
}
