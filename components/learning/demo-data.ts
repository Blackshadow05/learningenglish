export type Word = { id: number; word: string; translation: string; pronunciation: string; example: string; category: string; level: string; mastery: number; interval: number; due: number };
export const words: Word[] = [
  { id: 1, word: "Make yourself at home", translation: "Siéntete como en casa", pronunciation: "/meɪk jɔːˈself ət həʊm/", example: "Come in and make yourself at home!", category: "Vida cotidiana", level: "A2", mastery: 45, interval: 1, due: 0 },
  { id: 2, word: "A round trip", translation: "Un viaje de ida y vuelta", pronunciation: "/ə raʊnd trɪp/", example: "I'd like a round-trip ticket to London.", category: "Viajes", level: "A2", mastery: 70, interval: 3, due: 0 },
  { id: 3, word: "Figure out", translation: "Resolver · entender", pronunciation: "/ˈfɪɡər aʊt/", example: "Let's figure out how to get there.", category: "Trabajo", level: "B1", mastery: 30, interval: 1, due: 0 },
  { id: 4, word: "The usual", translation: "Lo de siempre", pronunciation: "/ðə ˈjuːʒuəl/", example: "Can I have the usual, please?", category: "Vida cotidiana", level: "A2", mastery: 80, interval: 5, due: 0 },
  { id: 5, word: "Look forward to", translation: "Esperar con ilusión", pronunciation: "/lʊk ˈfɔːrwərd tuː/", example: "I look forward to meeting you.", category: "Trabajo", level: "B1", mastery: 55, interval: 2, due: 0 },
  { id: 6, word: "Off the beaten track", translation: "Fuera de lo turístico", pronunciation: "/ɒf ðə ˈbiːtn træk/", example: "We found a café off the beaten track.", category: "Viajes", level: "B2", mastery: 20, interval: 1, due: 0 },
  { id: 7, word: "Catch up", translation: "Ponerse al día", pronunciation: "/kætʃ ʌp/", example: "Let's catch up over coffee.", category: "Vida cotidiana", level: "B1", mastery: 90, interval: 7, due: 0 },
  { id: 8, word: "On the same page", translation: "Estar de acuerdo", pronunciation: "/ɒn ðə seɪm peɪdʒ/", example: "Let's make sure we're on the same page.", category: "Trabajo", level: "B2", mastery: 65, interval: 3, due: 0 },
  { id: 9, word: "Turn up the volume", translation: "Subir el volumen", pronunciation: "/tɜːrn ʌp ðə ˈvɒljuːm/", example: "I love this song. Turn up the volume!", category: "Cultura y ocio", level: "A2", mastery: 75, interval: 3, due: 0 },
  { id: 10, word: "A must-see", translation: "Algo que no te puedes perder", pronunciation: "/ə mʌst siː/", example: "That new exhibition is a must-see.", category: "Cultura y ocio", level: "B1", mastery: 85, interval: 5, due: 0 },
];
export const interests = [{ name: "Viajes", icon: "globe" }, { name: "Trabajo", icon: "briefcase" }, { name: "Vida cotidiana", icon: "coffee" }, { name: "Cultura y ocio", icon: "headphones" }] as const;
export const placementQuestions = [
  { question: "She ___ a designer.", options: ["are", "is", "am", "be"], answer: 1, explanation: "Con she usamos is: She is a designer." },
  { question: "Yesterday, we ___ to the park.", options: ["go", "have go", "went", "going"], answer: 2, explanation: "Went es el pasado de go; yesterday sitúa la acción en el pasado." },
  { question: "I've lived here ___ three years.", options: ["since", "during", "from", "for"], answer: 3, explanation: "Usamos for para hablar de la duración: for three years." },
  { question: "If I had more time, I ___ a new language.", options: ["would learn", "will learn", "learn", "have learned"], answer: 0, explanation: "En una situación hipotética usamos if + pasado y would + verbo." },
  { question: "By the time we arrived, the film ___.", options: ["starts", "has started", "had started", "will start"], answer: 2, explanation: "Had started expresa una acción anterior a otra acción pasada." },
];
