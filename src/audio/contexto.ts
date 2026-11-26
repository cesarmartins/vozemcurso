let ctx: AudioContext | undefined;

/** Um AudioContext só para o app. Navegadores só liberam áudio depois de um clique. */
export function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
