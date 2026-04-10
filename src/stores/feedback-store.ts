import { create } from "zustand";
import type { FeedbackCategory } from "@/types/feedback";

type FeedbackState = {
  isOpen: boolean;
  defaultCategory: FeedbackCategory;
};

type FeedbackActions = {
  open: (category?: FeedbackCategory) => void;
  close: () => void;
};

export const useFeedbackStore = create<FeedbackState & FeedbackActions>(
  (set) => ({
    isOpen: false,
    defaultCategory: "general",

    open: (category = "general") =>
      set({ isOpen: true, defaultCategory: category }),

    close: () => set({ isOpen: false, defaultCategory: "general" }),
  }),
);
