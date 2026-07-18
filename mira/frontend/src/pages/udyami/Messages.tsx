/** Farmer's inbox — the direct thread with their NABARD field officer. */
import { useStore } from "../../state/store";
import ChatThread from "../../components/ChatThread";
import PageHero from "../../components/PageHero";

export default function Messages() {
  const { lang, enterpriseId } = useStore();
  if (!enterpriseId) return null;

  return (
    <div className="space-y-4 pb-4 md:max-w-3xl md:mx-auto w-full">
      <PageHero icon="💬" title={lang === "hi" ? "संदेश" : "Messages"}
        sub={lang === "hi"
          ? "आपके नाबार्ड फ़ील्ड अधिकारी से सीधी बातचीत — सवाल पूछें, सलाह पाएँ।"
          : "A direct line to your NABARD field officer — ask questions, get guidance."}
        from="#0f766e" to="#134e4a" emojis={["💬", "🌾", "🤝"]} />

      <section className="card p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="h-10 w-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: "linear-gradient(135deg, #fde8d7, #f6c6a4)" }} aria-hidden>👩‍💼</span>
          <div className="leading-tight">
            <p className="font-bold text-forest-800">{lang === "hi" ? "आपके फ़ील्ड अधिकारी" : "Your Field Officer"}</p>
            <p className="text-[11px] text-forest-800/55">Anjali Verma · NABARD</p>
          </div>
        </div>
        <ChatThread enterpriseId={enterpriseId} height={420} />
      </section>

      <p className="text-[11px] text-forest-800/50 text-center">
        {lang === "hi"
          ? "अधिकारी आमतौर पर 1–2 कार्यदिवस में जवाब देते हैं। आपात स्थिति में सीधे फ़ोन करें।"
          : "Your officer typically replies within 1–2 working days. For emergencies, please call directly."}
      </p>
    </div>
  );
}
