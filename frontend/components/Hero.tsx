import DotHero from "./DotHero";

const STACK: [string, string][] = [
  ["PyTorch", "M3 15c0-7 5-12 14-12-1 9-6 14-13 13l-1 2-2-1z"],
  ["FastAPI", "M10 1l8 4.5v9L10 19l-8-4.5v-9zM10 6l-4 2.3v4.4L10 15l4-2.3V8.3z"],
  ["LangGraph", "M1 5q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0zm0 7q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0z"],
  ["Qdrant", "M10 1a9 9 0 110 18 9 9 0 010-18zm0 3a6 6 0 100 12 6 6 0 000-12zm0 3a3 3 0 110 6 3 3 0 010-6z"],
  ["Next.js", "M1 17L7 6l3 5 3-7 6 13z"],
  ["Docker", "M10 1l9 4-9 4-9-4zm-9 8l9 4 9-4v3l-9 4-9-4zm0 5l9 4 9-4v2l-9 4-9-4z"],
];

export default function Hero() {
  return (
    <section id="top" className="relative h-screen min-h-[660px] overflow-hidden">
      <DotHero />
      <div className="absolute left-1/2 top-[22%] z-[3] w-[min(92vw,720px)] -translate-x-1/2 text-center max-md:top-[20%]">
        <h1 className="text-[clamp(38px,3.75vw,68px)] font-medium leading-[1.04] tracking-tightest">
          <span className="block text-mute">See Beyond</span>
          <span className="block">Every Pixel.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[360px] text-[clamp(13px,1.02vw,15.5px)] leading-[1.4] text-sub">
          An agentic image-intelligence studio. Recognise, transform and generate — securely, in one place.
        </p>
        <div className="cta-glow mt-[clamp(34px,3.6vw,52px)]">
          <a href="#studio" className="pill px-5 py-[11px]">Open the Studio</a>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-[clamp(28px,6vh,64px)] z-[3] flex flex-wrap items-center justify-center gap-x-[clamp(26px,4.6vw,66px)] gap-y-3.5 px-4 text-[clamp(13px,1.18vw,17px)] font-medium tracking-[-0.01em] text-mute">
        {STACK.map(([name, d]) => (
          <span key={name} className="flex items-center gap-[7px]">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d={d} /></svg>
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
