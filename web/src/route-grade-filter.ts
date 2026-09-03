import type { Grade } from "../../miniprogram/domain/types.js"

export const toggleGradeFilter = (selected: readonly Grade[], grade: Grade): Grade[] =>
  selected.includes(grade) ? selected.filter((item) => item !== grade) : [...selected, grade]
