import { Suspense } from "react";
import { Vocabulary } from "@/components/learning/vocabulary";
export default function VocabularyPage() { return <Suspense fallback={<p className="loading-message">Preparando tus palabras…</p>}><Vocabulary/></Suspense>; }
