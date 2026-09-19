export type Word = {
  id: string;
  word: string;
  translation: string;
  pronunciation: string;
  example: string;
  category: string;
  level: string;
  tipo: string;
  area: string;
  nivelBasico: number;
  mastery: number;
  interval: number;
  due: number;
};

export type FraseDia = {
  id: string;
  textoIngles: string;
  traduccionEspanol: string;
  level: string;
  category: string;
};

export const interests = [{ name: "Viajes", icon: "globe" }, { name: "Trabajo", icon: "briefcase" }, { name: "Vida cotidiana", icon: "coffee" }, { name: "Cultura y ocio", icon: "headphones" }] as const;

export const placementQuestions = [
  { question: "She ___ a designer.", options: ["are", "is", "am", "be"], answer: 1, explanation: "Con she usamos is: She is a designer." },
  { question: "Yesterday, we ___ to the park.", options: ["go", "have go", "went", "going"], answer: 2, explanation: "Went es el pasado de go; yesterday sitúa la acción en el pasado." },
  { question: "I've lived here ___ three years.", options: ["since", "during", "from", "for"], answer: 3, explanation: "Usamos for para hablar de la duración: for three years." },
  { question: "If I had more time, I ___ a new language.", options: ["would learn", "will learn", "learn", "have learned"], answer: 0, explanation: "En una situación hipotética usamos if + pasado y would + verbo." },
  { question: "By the time we arrived, the film ___.", options: ["starts", "has started", "had started", "will start"], answer: 2, explanation: "Had started expresa una acción anterior a otra acción pasada." },
];
