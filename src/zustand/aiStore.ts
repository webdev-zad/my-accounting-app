import { create } from "zustand";

interface Message {
  role: "user" | "assistant";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: {
    type:
      | "createPayee"
      | "createCategory"
      | "updatePayee"
      | "updateCategory"
      | "deletePayee"
      | "deleteCategory"
      | "listPayees"
      | "listCategories"
      | "downloadPayees"
      | "downloadCategories"
      | "mergePayees"
      | "changeParentCategory"
      | "changeCategoryType"
      | "bulkDeletePayees"
      | "bulkDeleteCategories"
      | "bulkCreateCategories";
    data: {
      name?: string;
      type?:
        | "income"
        | "expense"
        | "Asset"
        | "Liability"
        | "Equity"
        | "Revenue"
        | "COGS"
        | "Expense"
        | "Bank Account"
        | "Credit Card";
      parent_id?: string | null;
      payeeIds?: string[];
      categoryIds?: string[];
      newName?: string;
      targetPayeeId?: string;
      targetCategoryId?: string;
      bulkNames?: string[];
      bulkTypes?: string[];
    };
  };
}

interface AIState {
  // AI Panel state
  isPanelOpen: boolean;
  messages: Message[];
  awaitingConfirmation: boolean;
  awaitingClarification: boolean;
  pendingAction: {
    type:
      | "createPayee"
      | "createCategory"
      | "updatePayee"
      | "updateCategory"
      | "deletePayee"
      | "deleteCategory"
      | "listPayees"
      | "listCategories"
      | "downloadPayees"
      | "downloadCategories"
      | "mergePayees"
      | "changeParentCategory"
      | "changeCategoryType"
      | "bulkDeletePayees"
      | "bulkDeleteCategories"
      | "bulkCreateCategories";
    data: {
      name?: string;
      type?:
        | "income"
        | "expense"
        | "Asset"
        | "Liability"
        | "Equity"
        | "Revenue"
        | "COGS"
        | "Expense"
        | "Bank Account"
        | "Credit Card";
      parent_id?: string | null;
      payeeIds?: string[];
      categoryIds?: string[];
      newName?: string;
      targetPayeeId?: string;
      targetCategoryId?: string;
      bulkNames?: string[];
      bulkTypes?: string[];
    };
  } | null;

  // Actions
  setPanelOpen: (isOpen: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessage: (index: number, message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setPendingAction: (action: AIState["pendingAction"]) => void;
  setAwaitingConfirmation: (awaiting: boolean) => void;
  setAwaitingClarification: (awaiting: boolean) => void;
  clearPendingAction: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  // Initial state
  isPanelOpen: false,
  messages: [],
  awaitingConfirmation: false,
  awaitingClarification: false,
  pendingAction: null,

  // Actions
  setPanelOpen: (isOpen) => set({ isPanelOpen: isOpen }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (index, message) =>
    set((state) => ({
      messages: state.messages.map((msg, i) => (i === index ? message : msg)),
    })),

  setMessages: (messages) => set({ messages }),

  setPendingAction: (action) =>
    set({
      pendingAction: action,
      awaitingConfirmation:
        !!action &&
        (action.type === "createPayee" ||
          action.type === "createCategory" ||
          action.type === "updatePayee" ||
          action.type === "updateCategory" ||
          action.type === "deletePayee" ||
          action.type === "deleteCategory" ||
          action.type === "bulkDeletePayees" ||
          action.type === "bulkCreateCategories" ||
          action.type === "mergePayees" ||
          action.type === "downloadPayees" ||
          action.type === "downloadCategories"),
      awaitingClarification: !!action && !action.data.type && action.type === "createCategory",
    }),

  setAwaitingConfirmation: (awaiting) => set({ awaitingConfirmation: awaiting }),

  setAwaitingClarification: (awaiting) => set({ awaitingClarification: awaiting }),

  clearPendingAction: () =>
    set({
      pendingAction: null,
      awaitingConfirmation: false,
      awaitingClarification: false,
    }),
}));
