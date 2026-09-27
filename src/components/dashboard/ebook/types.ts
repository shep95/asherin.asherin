export interface EBookChapter {
  id: string;
  title: string;
  content: string;
  summary?: string;
  type?: "text" | "diagram";
  diagramDescription?: string;
}

export interface EBookMetadata {
  title: string;
  subtitle: string;
  author: string;
  description: string;
  dedication: string;
  copyright: string;
  aboutAuthor: string;
}

export interface EBookSettings {
  buildMode?: "ai" | "manual";
  wallpaper: string;
  pageSize: "a4" | "letter" | "paperback";
  fontSize: 10 | 12 | 14;
  lineSpacing: 1 | 1.5 | 2;
  chapterCount: number | "auto";
  tone: "formal" | "casual" | "technical" | "narrative";
  includeTableOfContents: boolean;
  includeChapterSummaries: boolean;
  includeDedication: boolean;
  includeAboutAuthor: boolean;
  includeCopyright: boolean;
  rewriteForConsistency: boolean;
  fixGrammar: boolean;
  removeDuplicates: boolean;
  includeDiagrams: boolean;
}

export type EBookStep = "upload" | "settings" | "processing" | "preview";

export interface EBookSession {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  description: string;
  dedication: string;
  copyright: string;
  aboutAuthor: string;
  settings: EBookSettings;
  chapters: EBookChapter[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EBookTextUpload {
  id: string;
  sessionId: string;
  fileName: string;
  content: string;
  wordCount: number;
  createdAt: Date;
}
