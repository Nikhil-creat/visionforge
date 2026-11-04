"use client";
import { useCallback, useState } from "react";
import Architecture from "@/components/Architecture";
import Catalogue from "@/components/Catalogue";
import ChatAssistant from "@/components/ChatAssistant";
import CommandPalette from "@/components/CommandPalette";
import Credentials from "@/components/Credentials";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Security from "@/components/Security";
import Studio from "@/components/Studio";

export default function Page() {
  const [assetId, setAssetId] = useState<string | null>(null);
  const [agentReq, setAgentReq] = useState<{ prompt: string; n: number } | null>(null);
  const [selectedOp, setSelectedOp] = useState<{ name: string; n: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const onAsset = useCallback((id: string | null) => setAssetId(id), []);

  const runAgent = useCallback((prompt: string) => {
    setAgentReq({ prompt, n: Date.now() });
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);

  return (
    <main className="relative">
      <a href="#catalogue" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      <Header />
      <Hero />
      <Catalogue onTry={(op) => setSelectedOp({ name: op, n: Date.now() })} />
      <section id="studio" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24">
        <p className="eyebrow mb-3">The studio</p>
        <h2 className="mb-10 h2 max-w-2xl"><span className="text-mute">Drop an image.</span> Edit it by hand or by sentence.</h2>
        <Studio onAssetChange={onAsset} agentRequest={agentReq} selectedOp={selectedOp} onSuggest={runAgent} />
      </section>
      <Security />
      <Architecture />
      <Credentials />
      <Footer />
      <ChatAssistant assetId={assetId} onRunAgent={runAgent} open={chatOpen} setOpen={setChatOpen} />
      <CommandPalette onRunAgent={runAgent} onToggleChat={toggleChat} />
    </main>
  );
}
