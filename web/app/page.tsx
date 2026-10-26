import GalleryBackground from "@/components/GalleryBackground";
import ChatCard from "@/components/ChatCard";
import LiveWidget from "@/components/LiveWidget";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <GalleryBackground />
      <section className="relative z-10 min-h-screen flex items-center justify-center px-5 pt-28 pb-32">
        <ChatCard />
      </section>

      <LiveWidget />
    </main>
  );
}
