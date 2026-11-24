import { QuestionType, type Question } from '@quiz-buzzer/shared/entities';

/** Question type as shown on teacher pages: "單題", or "題組・n 小題" (FR-021, FR-025). */
export function questionTypeLabel(question: Question): string {
  return question.type === QuestionType.GROUP
    ? `題組・${question.subQuestions.length} 小題`
    : '單題';
}

/** Blank cells of a question in sub-question order, e.g. "G5、G6". */
export function blankCellsLabel(question: Question): string {
  return question.subQuestions.map((sub) => sub.blankCell).join('、');
}
