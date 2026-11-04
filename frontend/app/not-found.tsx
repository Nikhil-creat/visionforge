export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="eyebrow mb-3">404</p>
        <h1 className="text-[clamp(32px,4vw,56px)] font-medium tracking-tightest">This pixel doesn’t exist.</h1>
        <a href="./" className="pill mt-8">Back to VisionForge</a>
      </div>
    </main>
  );
}
