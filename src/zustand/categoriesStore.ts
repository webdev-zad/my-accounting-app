import { create } from "zustand";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface Category {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

interface CategoriesState {
  categories: Category[];
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshCategories: () => Promise<void>;
  addCategory: (categoryData: { name: string; type: string; parent_id?: string | null }) => Promise<void>;
  updateCategory: (id: string, updates: { name?: string; type?: string; parent_id?: string | null }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  bulkDeleteCategories: (categoryIds: string[]) => Promise<void>;
  bulkCreateCategories: (categories: Array<{ name: string; type: string; parent_id?: string | null }>) => Promise<void>;
  downloadCategories: (filters?: { type?: string; parent_id?: string }) => Promise<void>;
  setCategories: (categories: Category[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Real-time subscriptions
  subscriptions: ReturnType<typeof supabase.channel>[];
  subscribeToCategories: (companyId: string) => () => void;
  unsubscribeFromCategories: () => void;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,
  subscriptions: [],

  refreshCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/category");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to refresh categories");
      }
      const data = await response.json();
      set({ categories: data.categories || [], isLoading: false });
    } catch (error) {
      console.error("Error refreshing categories:", error);
      set({ error: error instanceof Error ? error.message : "Failed to refresh categories", isLoading: false });
    }
  },

  addCategory: async (categoryData) => {
    try {
      const response = await api.post("/api/category/create", categoryData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add category");
      }
      const data = await response.json();
      set({ categories: data.categories || [] });
    } catch (error) {
      console.error("Error adding category:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to add category");
    }
  },

  updateCategory: async (id: string, updates) => {
    try {
      const response = await api.put("/api/category/update", { id, ...updates });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update category");
      }
      const data = await response.json();
      set({ categories: data.categories || [] });
    } catch (error) {
      console.error("Error updating category:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to update category");
    }
  },

  deleteCategory: async (id: string) => {
    try {
      const response = await api.delete("/api/category/delete", {
        body: JSON.stringify({ categoryId: id }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete category");
      }
      const data = await response.json();
      set({ categories: data.categories || [] });
    } catch (error) {
      console.error("Error deleting category:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete category");
    }
  },

  bulkDeleteCategories: async (categoryIds: string[]) => {
    try {
      const response = await api.delete("/api/category/bulk-delete", {
        body: JSON.stringify({ categoryIds }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete categories");
      }
      const data = await response.json();
      set({ categories: data.categories || [] });
    } catch (error) {
      console.error("Error bulk deleting categories:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete categories");
    }
  },

  bulkCreateCategories: async (categories) => {
    try {
      const response = await api.post("/api/category/bulk-create", { categories });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create categories");
      }
      const data = await response.json();
      set({ categories: data.allCategories || [] });
    } catch (error) {
      console.error("Error bulk creating categories:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to create categories");
    }
  },

  downloadCategories: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append("type", filters.type);
      if (filters.parent_id) params.append("parent_id", filters.parent_id);

      const url = `/api/category/download${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await api.get(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to download categories");
      }

      // Create a blob and download the file
      const blob = await response.blob();
      const url2 = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url2;
      a.download = "categories.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url2);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading categories:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to download categories");
    }
  },

  setCategories: (categories) => set({ categories }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Real-time subscription functions
  subscribeToCategories: (companyId: string) => {
    // Clean up existing subscriptions first
    get().unsubscribeFromCategories();

    const subscriptions: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to categories changes
    const categoriesSubscription = supabase
      .channel("categories_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chart_of_accounts",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log("Categories changed:", payload.eventType);
          get().refreshCategories();
        }
      )
      .subscribe();

    subscriptions.push(categoriesSubscription);
    set({ subscriptions });

    // Return cleanup function
    return () => {
      subscriptions.forEach((subscription) => {
        supabase.removeChannel(subscription);
      });
      set({ subscriptions: [] });
    };
  },

  unsubscribeFromCategories: () => {
    const { subscriptions } = get();
    subscriptions.forEach((subscription) => {
      supabase.removeChannel(subscription);
    });
    set({ subscriptions: [] });
  },
}));
