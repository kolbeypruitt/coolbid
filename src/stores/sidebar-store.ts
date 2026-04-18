import { create } from "zustand";

type SidebarState = {
  isOpen: boolean;
};

type SidebarActions = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const useSidebarStore = create<SidebarState & SidebarActions>(
  (set) => ({
    isOpen: false,

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  }),
);
