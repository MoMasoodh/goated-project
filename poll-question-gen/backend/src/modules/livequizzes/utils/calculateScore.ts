export function calculateScore({

  isCorrect,
  responseTime,
  maxPoints,
  timer

}: {
  isCorrect: boolean
  responseTime: number
  maxPoints: number
  timer: number
}) {

  if (!isCorrect) return 0

  if (responseTime >= timer) return 0

  const timeRatio = responseTime / timer

  const points =
    Math.round(maxPoints * (1 - timeRatio))

  return Math.max(points, 1)

}