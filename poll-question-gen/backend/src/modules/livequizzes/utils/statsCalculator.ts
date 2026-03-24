export function calculateStats(room: any, userId: string) {

  let totalAnswers = 0;
  let correctAnswers = 0;

  let streak = 0;
  let maxStreak = 0;

  for (const poll of room.polls) {

    const answer = poll.answers.find(
      (a: any) => a.userId === userId
    );

    if (!answer) continue;

    totalAnswers++;

    const isCorrect =
      poll.correctOptionIndex === answer.answerIndex;

    if (isCorrect) {

      correctAnswers++;
      streak++;

      if (streak > maxStreak)
        maxStreak = streak;

    } else {

      streak = 0;

    }

  }

  const accuracy =
    totalAnswers > 0
      ? (correctAnswers / totalAnswers) * 100
      : 0;

  return {

    totalAnswers,
    correctAnswers,
    accuracy,
    maxStreak

  };

}