import { create } from "zustand";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface Payee {
  id: string;
  name: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

interface PayeesState {
  payees: Payee[];
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshPayees: () => Promise<void>;
  addPayee: (payeeData: { name: string }) => Promise<void>;
  createPayeeForTransaction: (name: string) => Promise<Payee | null>;
  updatePayee: (id: string, name: string) => Promise<void>;
  deletePayee: (id: string) => Promise<void>;
  bulkDeletePayees: (ids: string[]) => Promise<void>;
  mergePayees: (sourceId: string, targetId: string) => Promise<void>;
  downloadPayees: () => Promise<void>;
  setPayees: (payees: Payee[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Real-time subscriptions
  subscriptions: ReturnType<typeof supabase.channel>[];
  subscribeToPayees: (companyId: string) => () => void;
  unsubscribeFromPayees: () => void;
}

export const usePayeesStore = create<PayeesState>((set, get) => ({
  payees: [],
  isLoading: false,
  error: null,
  subscriptions: [],

  refreshPayees: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/payee");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to refresh payees");
      }
      const data = await response.json();
      set({ payees: data.payees || [], isLoading: false });
    } catch (error) {
      console.error("Error refreshing payees:", error);
      set({ error: error instanceof Error ? error.message : "Failed to refresh payees", isLoading: false });
    }
  },

  addPayee: async (payeeData) => {
    try {
      console.log("addPayee called with:", payeeData); // Debug log
      // Prepare data for API call
      const requestData = {
        name: payeeData.name.trim(),
      };
      console.log("API request data:", requestData); // Debug log
      // Call the API route
      const response = await api.post("/api/payee/create", requestData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add payee");
      }

      const data = await response.json();
      // Update the store with the new payees list
      set({ payees: data.payees || [] });
    } catch (error) {
      console.error("Error adding payee:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to add payee");
    }
  },

  createPayeeForTransaction: async (name: string) => {
    try {
      const response = await api.post("/api/payee/create", { name: name.trim() });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create payee");
      }
      const data = await response.json();
      set({ payees: data.payees || [] });
      return data.payee || null;
    } catch (error) {
      console.error("Error creating payee for transaction:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to create payee");
    }
  },

  updatePayee: async (id: string, name: string) => {
    try {
      const response = await api.put("/api/payee/update", { id, name });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update payee");
      }
      const data = await response.json();
      set({ payees: data.payees || [] });
    } catch (error) {
      console.error("Error updating payee:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to update payee");
    }
  },

  deletePayee: async (id: string) => {
    try {
      const response = await api.delete("/api/payee/delete", {
        body: JSON.stringify({ payeeId: id }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete payee");
      }
      const data = await response.json();
      set({ payees: data.payees || [] });
    } catch (error) {
      console.error("Error deleting payee:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete payee");
    }
  },

  bulkDeletePayees: async (ids: string[]) => {
    try {
      const response = await api.delete("/api/payee/bulk-delete", {
        body: JSON.stringify({ payeeIds: ids }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete payees");
      }
      const data = await response.json();
      set({ payees: data.payees || [] });
    } catch (error) {
      console.error("Error bulk deleting payees:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete payees");
    }
  },

  mergePayees: async (sourceId: string, targetId: string) => {
    try {
      const response = await api.post("/api/payee/merge", {
        sourcePayeeId: sourceId,
        targetPayeeId: targetId,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to merge payees");
      }
      const data = await response.json();
      set({ payees: data.payees || [] });
    } catch (error) {
      console.error("Error merging payees:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to merge payees");
    }
  },

  downloadPayees: async () => {
    try {
      const response = await api.get("/api/payee/download");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to download payees");
      }
      // Create a blob and download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payees.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading payees:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to download payees");
    }
  },

  setPayees: (payees) => set({ payees }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Real-time subscription functions
  subscribeToPayees: (companyId: string) => {
    // Clean up existing subscriptions first
    get().unsubscribeFromPayees();

    const subscriptions: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to payees changes
    const payeesSubscription = supabase
      .channel("payees_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payees",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log("Payees changed:", payload.eventType);
          get().refreshPayees();
        }
      )
      .subscribe();

    subscriptions.push(payeesSubscription);
    set({ subscriptions });

    // Return cleanup function
    return () => {
      subscriptions.forEach((subscription) => {
        supabase.removeChannel(subscription);
      });
      set({ subscriptions: [] });
    };
  },

  unsubscribeFromPayees: () => {
    const { subscriptions } = get();
    subscriptions.forEach((subscription) => {
      supabase.removeChannel(subscription);
    });
    set({ subscriptions: [] });
  },
}));
