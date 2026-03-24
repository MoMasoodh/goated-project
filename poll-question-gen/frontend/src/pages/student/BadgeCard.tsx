import { getBadgeTier } from "@/shared/getBadgeTier";
import { UserAchievement } from "@/shared/types";
import { Sparkles } from "lucide-react"

interface Props {
    badge: UserAchievement;
}

export default function BadgeCard({ badge }: Props) {

    const tier = getBadgeTier(badge.badgeId?.category, badge.badgeId?.name);
    const Icon = tier.Icon;
    return (
        <div
            className={`group relative flex cursor-default flex-col items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl ${tier.bg} ${tier.border}`}
        >
            {/* Decorative background glow on hover */}
            <div className="absolute inset-0 -z-10 rounded-2xl bg-white opacity-0 shadow-sm transition-opacity duration-300 group-hover:opacity-100 dark:bg-slate-950/95" />

            {/* Primary Content Container (fades out slightly on hover to focus on description) */}
            <div className="flex flex-col items-center transition-all duration-300 group-hover:opacity-0 group-hover:scale-90">
                {/* Icon Wrapper with Ring Effect */}
                <div className="relative mb-3">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br shadow-lg transition-transform duration-300 ${tier.iconContainer}`}>
                        <Icon className={`w-7 h-7 ${tier.iconColor}`} />
                    </div>
                    {/* Level Indicator or Sparkle */}
                    <div className="absolute -right-1 -top-1 rounded-full border border-gray-100 bg-white p-1 shadow-sm dark:border-slate-600 dark:bg-slate-950">
                        <Sparkles className="w-3 h-3 text-yellow-500 animate-pulse" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-bold text-center leading-tight mb-1 ${tier.text}`}>
                        {badge.badgeId?.name || "Achievement"}
                    </span>
                    <div className="flex items-center gap-1">
                        <span className={`rounded-full border border-current/10 bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider dark:bg-slate-900/60 ${tier.categoryText}`}>
                            {badge.badgeId?.category || "General"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Hover Description Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
                <p className={`text-[11px] font-medium leading-relaxed ${tier.text}`}>
                    {badge.badgeId?.description || "No description available."}
                </p>
                <div className={`mt-2 w-8 h-0.5 rounded-full opacity-30 ${tier.categoryText} bg-current`} />
            </div>

            {/* Progress Bar (at bottom) */}
            <div className="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-black/5 dark:bg-white/10">
                <div className={`h-full opacity-30 w-full bg-current ${tier.categoryText}`} />
            </div>
        </div>
    );

}
