import UserRoomStats from "#root/shared/database/models/UserRoomStats.js";


export async function updateRoomStats({
  userId,
  roomCode,
  isCorrect,
  responseTime,
  points,
}){

  let stats = await UserRoomStats.findOne({ userId, roomCode });

  if(!stats){
    stats = await UserRoomStats.create({ userId, roomCode });
  }

  stats.totalAnswers++;
  stats.totalPoints += points;

  if(isCorrect){

    stats.correctAnswers++;
    stats.currentStreak++;

    if(stats.currentStreak > stats.maxStreak){
      stats.maxStreak = stats.currentStreak;
    }

  }else{
    stats.currentStreak = 0;
  }

  stats.accuracy =
    (stats.correctAnswers / stats.totalAnswers) * 100;

  if(
    isCorrect &&
    (stats.fastestResponse === null || responseTime < stats.fastestResponse)
  ){

     stats.fastestResponse = responseTime;
  }

  await stats.save();

  return stats;

}
