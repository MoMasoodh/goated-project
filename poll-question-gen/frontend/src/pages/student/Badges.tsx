import { useCallback, useEffect, useState } from "react";
import BadgeCard from "./BadgeCard";
import { useAuthStore } from "@/lib/store/auth-store";
import api from "@/lib/api/api";
import { Lock, ShieldCheck, Star } from "lucide-react";
import type { Badge, UserAchievement } from "@/shared/types";
import { getBadgeTier } from "@/shared/getBadgeTier";

type BadgeResponse = {
  achievedBadges: UserAchievement[];
  unachievedBadges: Badge[];
};

const Badges = () => {

  const [achievedBadges, setAchievedBadges] = useState<UserAchievement[]>([]);
  const [unachievedBadges, setUnachievedBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(false);
  const { user: currentUser } = useAuthStore();

  const getUserBadges = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<BadgeResponse>(`/livequizzes/rooms/achievement/${currentUser?.uid}`);
      setAchievedBadges(res.data?.achievedBadges || []);
      setUnachievedBadges(res.data?.unachievedBadges || []);
    } catch (error) {
      console.error("Error fetching badges:", error);
    } finally {
      setLoading(false)
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    getUserBadges();
  }, [getUserBadges]);

  return (
    <section className="min-h-[400px] rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/55">
      {/* Header Section */}
      <div className="flex items-end justify-between mb-8 px-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Rewards</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">
            Achievements
          </h2>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Total Earned</span>
          <p className="text-2xl text-center font-bold text-indigo-600 dark:text-indigo-300">{achievedBadges.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Earned Badges</h3>
            </div>

            {achievedBadges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {achievedBadges.map((badge) => (
                  <BadgeCard key={badge._id} badge={badge} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/80 py-14 dark:border-slate-700 dark:bg-slate-900/50">
                <Star className="mb-3 h-10 w-10 text-gray-300 dark:text-slate-600" />
                <p className="font-medium text-gray-500 dark:text-slate-400">No earned badges yet.</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Unearned Badges</h3>
            </div>

            {unachievedBadges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {unachievedBadges.map((badge) => {
                  const tier = getBadgeTier(badge.category, badge.name);
                  const Icon = tier.Icon;
                  return (
                    <div
                      key={badge._id}
                      className="group relative flex cursor-default flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 p-5 opacity-75 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800/70"
                    >
                      {/* Decorative background glow on hover */}
                      <div className="absolute inset-0 -z-10 rounded-2xl bg-white opacity-0 shadow-sm transition-opacity duration-300 group-hover:opacity-100 dark:bg-slate-900/95" />

                      {/* Primary Content Container (fades out slightly on hover to focus on criteria) */}
                      <div className="flex flex-col items-center transition-all duration-300 group-hover:opacity-0 group-hover:scale-90">
                        {/* Icon Wrapper with Ring Effect */}
                        <div className="relative mb-3">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br shadow-lg grayscale transition-transform duration-300 ${tier.iconContainer}`}>
                            <Icon className={`w-7 h-7 ${tier.iconColor}`} />
                          </div>
                          {/* Lock Indicator */}
                          <div className="absolute -right-1 -top-1 rounded-full border border-gray-100 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-950">
                            <Lock className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col items-center">
                          <span className="mb-1 text-center text-sm font-bold leading-tight text-slate-700 dark:text-slate-200">
                            {badge.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                              {badge.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Hover Criteria Overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
                        <p className="text-[11px] font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                          {badge.criteria || "Complete more polls to unlock this badge."}
                        </p>
                        <div className="mt-2 h-0.5 w-8 rounded-full bg-slate-500 opacity-30 dark:bg-slate-300" />
                      </div>

                      {/* Progress Bar (at bottom) - optional for unearned */}
                      <div className="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-black/5 dark:bg-white/10">
                        <div className="h-full w-0 bg-slate-500 opacity-30 dark:bg-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-white/80 py-14 dark:border-emerald-800 dark:bg-slate-900/50">
                <ShieldCheck className="mb-3 h-10 w-10 text-emerald-400 dark:text-emerald-500" />
                <p className="font-semibold text-emerald-600 dark:text-emerald-300">All badges unlocked.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>

  )
}

export default Badges
