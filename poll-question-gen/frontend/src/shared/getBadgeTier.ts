import {
  Award,
  CheckCircle,
  Flame,
  ShieldCheck,
  Star,
  Swords,
  Zap,
} from "lucide-react";

export const getBadgeTier = (category = "", name = "") => {
  const cat = category.toLowerCase();
  const title = (name || "").toLowerCase();

  let Icon = Award;
  if (title === "first attempt") {
    Icon = Star;
  } else if (title === "first correct answer") {
    Icon = CheckCircle;
  } else if (title === "quick thinker") {
    Icon = Zap;
  } else if (title === "correct streak") {
    Icon = Flame;
  } else if (title === "accuracy champion") {
    Icon = ShieldCheck;
  } else if (title === "10 correct answers") {
    Icon = Swords;
  } else if (title.includes("quick")) {
    Icon = Zap;
  } else if (title.includes("streak")) {
    Icon = Flame;
  } else if (title.includes("accuracy")) {
    Icon = ShieldCheck;
  } else if (title.includes("correct")) {
    Icon = CheckCircle;
  } else if (title.includes("first")) {
    Icon = Star;
  }

  if (cat === "engagement") {
    const text = "text-amber-800 dark:text-amber-200";
    return {
      bg: "from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20",
      border: "border-amber-200/70 dark:border-amber-700/50",
      iconContainer: "from-amber-400 to-yellow-600",
      text,
      categoryText: "text-amber-600 dark:text-amber-300",
      iconColor: text,
      Icon,
    };
  }

  if (cat === "speed") {
    const text = "text-emerald-800 dark:text-emerald-200";
    return {
      bg: "from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20",
      border: "border-emerald-200/70 dark:border-emerald-700/50",
      iconContainer: "from-emerald-400 to-green-600",
      text,
      categoryText: "text-emerald-600 dark:text-emerald-300",
      iconColor: text,
      Icon,
    };
  }

  if (cat === "performance") {
    const text = "text-rose-800 dark:text-rose-200";
    return {
      bg: "from-rose-50 to-orange-50 dark:from-rose-900/30 dark:to-orange-900/20",
      border: "border-rose-200/70 dark:border-rose-700/50",
      iconContainer: "from-rose-400 to-orange-600",
      text,
      categoryText: "text-rose-600 dark:text-rose-300",
      iconColor: text,
      Icon,
    };
  }

  if (cat === "milestone") {
    const text = "text-cyan-800 dark:text-cyan-200";
    return {
      bg: "from-cyan-50 to-sky-50 dark:from-cyan-900/30 dark:to-sky-900/20",
      border: "border-cyan-200/70 dark:border-cyan-700/50",
      iconContainer: "from-cyan-400 to-sky-600",
      text,
      categoryText: "text-cyan-600 dark:text-cyan-300",
      iconColor: text,
      Icon,
    };
  }

  // fallback 
  const text = "text-indigo-900 dark:text-indigo-200";
  return {
    bg: "from-indigo-50/80 to-purple-50/80 dark:from-indigo-900/30 dark:to-purple-900/30",
    border: "border-indigo-200/70 dark:border-indigo-700/50",
    iconContainer: "from-indigo-400 to-purple-500",
    text,
    categoryText: "text-indigo-600 dark:text-indigo-300",
    iconColor: text,
    Icon,
  };
};
