import { audio } from './contexto';

export const TAMANHO_JANELA = 2048;

export class ErroMicrofone extends Error {
  constructor(readonly motivo: 'sem-suporte' | 'negado' | 'falhou', mensagem: string) {
    super(mensagem);
  }
}

export class Microfone {
  private stream?: MediaStream;
  private fonte?: MediaStreamAudioSourceNode;
  private analisador?: AnalyserNode;
  readonly amostras = new Float32Array(TAMANHO_JANELA);

  get ligado() {
    return !!this.stream;
  }

  get taxa() {
    return audio().sampleRate;
  }

  /**
   * Segundos entre o som tocar no fone e a voz correspondente ser analisada:
   * saída + entrada + meia janela de análise.
   */
  get atraso(): number {
    const ctx = audio();
    const config = this.stream?.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
    const entrada = config?.latency ?? 0.01;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + entrada + TAMANHO_JANELA / 2 / ctx.sampleRate;
  }

  async ligar(dispositivo?: string): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new ErroMicrofone('sem-suporte', 'Este navegador não dá acesso ao microfone. Use o Chrome, o Edge ou o Safari.');
    }
    try {
      // Sem cancelamento de eco, supressão de ruído e ganho automático: eles distorcem afinação e volume.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: dispositivo ? { exact: dispositivo } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      const nome = e instanceof DOMException ? e.name : 'Error';
      throw nome === 'NotAllowedError'
        ? new ErroMicrofone('negado', 'O acesso ao microfone foi negado. Libere o microfone para esta página nas permissões do navegador e tente de novo.')
        : new ErroMicrofone('falhou', `Não foi possível abrir o microfone (${nome}). Verifique se ele está conectado.`);
    }
    const ctx = audio();
    this.fonte = ctx.createMediaStreamSource(this.stream);
    this.analisador = ctx.createAnalyser();
    this.analisador.fftSize = TAMANHO_JANELA;
    this.analisador.smoothingTimeConstant = 0;
    this.fonte.connect(this.analisador);
  }

  desligar() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.fonte?.disconnect();
    this.stream = this.fonte = this.analisador = undefined;
  }

  /** Copia as últimas amostras do microfone para `amostras`. */
  ler(): Float32Array {
    this.analisador?.getFloatTimeDomainData(this.amostras);
    return this.amostras;
  }

  static async listar(): Promise<MediaDeviceInfo[]> {
    try {
      const todos = await navigator.mediaDevices.enumerateDevices();
      return todos.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
    } catch {
      return [];
    }
  }
}
