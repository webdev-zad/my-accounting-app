"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/zustand/authStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";

import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { Download, Plus, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { showSuccessToast, showErrorToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

type Category = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
};

type Payee = {
  id: string;
  name: string;
  company_id: string;
  isValid?: boolean;
  validationMessage?: string;
};

type CategoryImportModalState = {
  isOpen: boolean;
  step: "upload" | "review";
  csvData: CategoryImportData[];
  isLoading: boolean;
  error: string | null;
  selectedCategories: Set<string>;
  autoCreateMissing: boolean;
};

type PayeeImportModalState = {
  isOpen: boolean;
  step: "upload" | "review";
  csvData: Payee[];
  isLoading: boolean;
  error: string | null;
  selectedPayees: Set<string>;
};

type CategoryCSVRow = {
  Name: string;
  Type: string;
  Parent?: string;
};

type PayeeCSVRow = {
  Name: string;
};

type CategoryImportData = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
  company_id?: string;
  isValid: boolean;
  validationMessage?: string;
  needsParentCreation?: boolean;
  parentName?: string;
};

type SortConfig = {
  key: "name" | "type" | "parent" | null;
  direction: "asc" | "desc";
};

type PayeeSortConfig = {
  key: "name" | null;
  direction: "asc" | "desc";
};

type SelectOption = {
  value: string;
  label: string;
};

type MergeModalState = {
  isOpen: boolean;
  selectedCategories: Set<string>;
  targetCategoryId: string | null;
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
};

type RenameMergeModalState = {
  isOpen: boolean;
  originalCategory: Category | null;
  existingCategory: Category | null;
  isLoading: boolean;
  error: string | null;
};

export default function ChartOfAccountsPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  // Use separate stores for categories and payees
  const {
    categories: accounts,
    isLoading: loading,
    error: categoriesError,
    highlightedCategoryIds,
    lastActionCategoryId,
    refreshCategories: refreshCategoriesFromStore,
    addCategory,
    updateCategoryWithMergeCheck,
    mergeFromRename,
    deleteCategory,
    mergeCategories,
    highlightCategory,
  } = useCategoriesStore();

  const {
    payees,
    isLoading: payeesLoading,
    error: payeesError,
    highlightedPayeeIds,
    lastActionPayeeId,
    refreshPayees: refreshPayeesFromStore,
    addPayee,
    updatePayee,
    deletePayee,
  } = usePayeesStore();

  // Create wrapper functions for refresh
  const refreshCategories = useCallback(async () => {
    await refreshCategoriesFromStore();
  }, [refreshCategoriesFromStore]);

  const refreshPayees = useCallback(async () => {
    await refreshPayeesFromStore();
  }, [refreshPayeesFromStore]);

  const [search, setSearch] = useState("");
  const [payeeSearch, setPayeeSearch] = useState("");
  const categoriesTableRef = useRef<HTMLDivElement>(null);

  // Add new account state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentOptions, setParentOptions] = useState<Category[]>([]);

  // Add new payee state
  const [newPayeeName, setNewPayeeName] = useState("");

  // Error states for form validation
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [payeeError, setPayeeError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editParentId, setEditParentId] = useState<string | null>(null);

  // Refs to store the latest values for immediate access
  const editParentIdRef = useRef<string | null>(null);
  const editTypeRef = useRef<string>("");

  // Payee edit state
  const [editingPayeeId, setEditingPayeeId] = useState<string | null>(null);
  const [editPayeeName, setEditPayeeName] = useState("");

  // AI Integration states are now handled by Zustand store

  // Import modal state
  const [categoryImportModal, setCategoryImportModal] = useState<CategoryImportModalState>({
    isOpen: false,
    step: "upload",
    csvData: [],
    isLoading: false,
    error: null,
    selectedCategories: new Set(),
    autoCreateMissing: false,
  });

  const [payeeImportModal, setPayeeImportModal] = useState<PayeeImportModalState>({
    isOpen: false,
    step: "upload",
    csvData: [],
    isLoading: false,
    error: null,
    selectedPayees: new Set(),
  });

  // Sorting state
  const [categorySortConfig, setCategorySortConfig] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  const [payeeSortConfig, setPayeeSortConfig] = useState<PayeeSortConfig>({
    key: null,
    direction: "asc",
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [payeeCurrentPage, setPayeeCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Fixed items per page

  // Merge modal state
  const [mergeModal, setMergeModal] = useState<MergeModalState>({
    isOpen: false,
    selectedCategories: new Set(),
    targetCategoryId: null,
    isLoading: false,
    error: null,
    searchTerm: "",
  });

  // Rename merge modal state
  const [renameMergeModal, setRenameMergeModal] = useState<RenameMergeModalState>({
    isOpen: false,
    originalCategory: null,
    existingCategory: null,
    isLoading: false,
    error: null,
  });

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setPayeeCurrentPage(1);
  }, [payeeSearch]);

  // Pagination utility function
  const getPaginatedData = <T,>(data: T[], currentPage: number, itemsPerPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedData: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      totalItems: data.length,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, data.length),
    };
  };

  // Custom Pagination Component
  const CustomPagination = ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  }) => {
    if (totalPages <= 1) return null;

    const getVisiblePages = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];

      for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, "...");
      } else {
        rangeWithDots.push(1);
      }

      rangeWithDots.push(...range);

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push("...", totalPages);
      } else {
        rangeWithDots.push(totalPages);
      }

      return rangeWithDots;
    };

    return (
      <Pagination className="justify-start">
        <PaginationContent className="gap-1">
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationPrevious
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}

          {getVisiblePages().map((page, index) => (
            <PaginationItem key={index}>
              {page === "..." ? (
                <PaginationEllipsis className="border px-3 py-1 rounded text-xs h-auto bg-gray-100" />
              ) : (
                <PaginationLink
                  onClick={() => onPageChange(page as number)}
                  isActive={page === currentPage}
                  className={`border px-3 py-1 rounded text-xs h-auto cursor-pointer ${
                    page === currentPage ? "bg-gray-200 text-gray-900 font-semibold" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          {currentPage < totalPages && (
            <PaginationItem>
              <PaginationNext
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    );
  };

  // Use highlight function from Zustand store and add scroll behavior
  const highlightCategoryWithScroll = useCallback(
    (categoryId: string) => {
      highlightCategory(categoryId);

      setTimeout(() => {
        const element = document.getElementById(`category-${categoryId}`);
        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);
    },
    [highlightCategory]
  );

  // Similar highlight function for payees
  const highlightPayeeWithScroll = useCallback((payeeId: string) => {
    // Get the highlightPayee function from the payees store
    const { highlightPayee } = usePayeesStore.getState();
    highlightPayee(payeeId);

    setTimeout(() => {
      const element = document.getElementById(`payee-${payeeId}`);
      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 100);
  }, []);

  // Initialize data when component mounts
  useEffect(() => {
    if (currentCompany?.id) {
      refreshCategories();
      refreshPayees();
    }
  }, [currentCompany?.id, refreshCategories, refreshPayees]);

  // Options for Select components
  const typeOptions: SelectOption[] = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: type,
  }));

  const getParentOptions = (currentId?: string, type?: string): SelectOption[] => {
    const availableParents = accounts.filter(
      (cat: Category) => cat.id !== currentId && (type ? cat.type === type : true)
    );
    return [
      { value: "", label: "None" },
      ...availableParents.map((cat: Category) => ({
        value: cat.id,
        label: cat.name,
      })),
    ];
  };

  const fetchParentOptions = useCallback(async () => {
    if (!hasCompanyContext || !currentCompany?.id) return;

    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", currentCompany!.id)
      .is("parent_id", null);

    if (error) {
      console.error("Error fetching parent options:", error);
    } else if (data) {
      setParentOptions(data as Category[]);
    }
  }, [currentCompany?.id, hasCompanyContext]);

  useEffect(() => {
    fetchParentOptions();
  }, [currentCompany?.id, hasCompanyContext, fetchParentOptions]);

  // Real-time subscriptions for both categories and payees
  useEffect(() => {
    if (!hasCompanyContext || !currentCompany?.id) return;

    console.log("Setting up real-time subscriptions for company:", currentCompany.id);

    // Categories subscription
    const categoriesChannel = supabase
      .channel(`chart_of_accounts_${currentCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chart_of_accounts",
          filter: `company_id=eq.${currentCompany.id}`,
        },
        (payload) => {
          console.log("Categories real-time change detected:", payload);
          refreshCategories();

          let recordId: string | null = null;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            recordId = payload.new.id;
          }

          if (recordId) {
            highlightCategoryWithScroll(recordId);
          }

          fetchParentOptions();
        }
      )
      .subscribe();

    // Payees subscription
    const payeesChannel = supabase
      .channel(`payees_${currentCompany.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payees",
          filter: `company_id=eq.${currentCompany.id}`,
        },
        (payload) => {
          console.log("Payees real-time change detected:", payload);
          refreshPayees();

          let recordId: string | null = null;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            recordId = payload.new.id;
          }

          if (recordId) {
            highlightPayeeWithScroll(recordId);
          }
        }
      )
      .subscribe();

    return () => {
      console.log("Cleaning up real-time subscriptions");
      supabase.removeChannel(categoriesChannel);
      supabase.removeChannel(payeesChannel);
    };
  }, [
    currentCompany?.id,
    hasCompanyContext,
    highlightCategoryWithScroll,
    highlightPayeeWithScroll,
    fetchParentOptions,
    refreshCategories,
    refreshPayees,
  ]);

  // Sorting functions
  const sortCategories = (categories: Category[], sortConfig: SortConfig) => {
    if (!sortConfig.key) return categories;

    return [...categories].sort((a, b) => {
      if (sortConfig.key === "name") {
        return sortConfig.direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortConfig.key === "type") {
        return sortConfig.direction === "asc" ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
      }
      if (sortConfig.key === "parent") {
        const aParent = a.parent_id ? accounts.find((acc: Category) => acc.id === a.parent_id)?.name || "" : "";
        const bParent = b.parent_id ? accounts.find((acc: Category) => acc.id === b.parent_id)?.name || "" : "";
        return sortConfig.direction === "asc" ? aParent.localeCompare(bParent) : bParent.localeCompare(aParent);
      }
      return 0;
    });
  };

  const sortPayees = (payees: Payee[], sortConfig: PayeeSortConfig) => {
    if (!sortConfig.key) return payees;

    return [...payees].sort((a, b) => {
      if (sortConfig.key === "name") {
        return sortConfig.direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return 0;
    });
  };

  const handleCategorySort = (key: "name" | "type" | "parent") => {
    setCategorySortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handlePayeeSort = (key: "name") => {
    setPayeeSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // Payees are now managed by Zustand store - no need for separate fetch function

  const filteredAccounts = sortCategories(
    accounts.filter((account: Category) => {
      const searchLower = search.toLowerCase();
      const matchesName = account.name.toLowerCase().includes(searchLower);
      const matchesType = account.type.toLowerCase().includes(searchLower);

      // Check if parent name matches (for subaccounts)
      let matchesParent = false;
      if (account.parent_id) {
        const parentAccount = accounts.find((acc) => acc.id === account.parent_id);
        if (parentAccount) {
          matchesParent = parentAccount.name.toLowerCase().includes(searchLower);
        }
      }

      // If this account matches the search, include it
      if (matchesName || matchesType || matchesParent) return true;

      // If this is a parent account, check if any of its children match
      if (account.parent_id === null) {
        const hasMatchingChild = accounts.some(
          (child) =>
            child.parent_id === account.id &&
            (child.name.toLowerCase().includes(searchLower) || child.type.toLowerCase().includes(searchLower))
        );
        return hasMatchingChild;
      }

      return false;
    }),
    categorySortConfig
  );

  const filteredPayees = sortPayees(
    payees.filter((payee) => payee.name.toLowerCase().includes(payeeSearch.toLowerCase())),
    payeeSortConfig
  );

  // Get paginated data for categories and payees
  const categoryPaginationData = getPaginatedData(filteredAccounts, currentPage, itemsPerPage);
  const payeePaginationData = getPaginatedData(filteredPayees, payeeCurrentPage, itemsPerPage);

  const displayedCategories = categoryPaginationData.paginatedData;
  const displayedPayees = payeePaginationData.paginatedData;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newType || !hasCompanyContext) return;

    // Clear previous error
    setCategoryError(null);

    try {
      const categoryData = {
        name: newName,
        type: newType,
        parent_id: parentId || null,
        company_id: currentCompany!.id,
      };

      // Use the Zustand store method which handles optimistic updates
      const result = await addCategory(categoryData);

      if (result) {
        // Clear form on success
        setNewName("");
        setNewType("");
        setParentId(null);
        setCategoryError(null);

        // Only refresh parent options (needed for dropdown)
        await fetchParentOptions();

        // Highlighting is already handled by the store
      } else {
        // Error is already set by the store - wait for it to be available
        // The categoriesError from store will be displayed in the UI
        setCategoryError(null); // Let the store error be displayed instead
      }
    } catch (error) {
      console.error("Error creating category:", error);
      setCategoryError("Network error. Please try again.");
    }
  };

  const handleAddPayee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayeeName || !hasCompanyContext) return;

    // Clear previous error
    setPayeeError(null);

    const payeeData = {
      name: newPayeeName,
      company_id: currentCompany!.id,
    };

    const result = await addPayee(payeeData);

    if (result) {
      setNewPayeeName("");
      setPayeeError(null);
    } else {
      // Error is handled by the store
      setPayeeError(payeesError);
    }
  };

  const handleDelete = async (id: string) => {
    // First check if this category is linked to a bank account
    const { data: categoryData, error: categoryError } = await supabase
      .from("chart_of_accounts")
      .select("plaid_account_id, name")
      .eq("id", id)
      .single();

    if (categoryError) {
      console.error("Error checking category:", categoryError);
      alert("Error checking category details. Please try again.");
      return;
    }

    if (categoryData?.plaid_account_id) {
      alert(
        `This category "${categoryData.name}" cannot be deleted because it is linked to a bank account. Bank account categories are automatically managed by the system.`
      );
      return;
    }

    // Show confirmation dialog before deleting
    const categoryToDelete = accounts.find((acc) => acc.id === id);
    const categoryName = categoryToDelete?.name || "this category";

    if (!window.confirm(`Are you sure you want to delete "${categoryName}"? This action cannot be undone.`)) {
      return;
    }

    const success = await deleteCategory(id);
    if (success) {
      setEditingId(null);
      fetchParentOptions();
    } else {
      alert(categoriesError || "Failed to delete category. Please try again.");
    }
  };

  const handleDeletePayee = async (id: string) => {
    console.log("Delete payee button clicked for ID:", id);

    // Show confirmation dialog before deleting
    const payeeToDelete = payees.find((payee) => payee.id === id);
    const payeeName = payeeToDelete?.name || "this payee";

    console.log("Found payee to delete:", payeeName);

    if (!window.confirm(`Are you sure you want to delete "${payeeName}"? This action cannot be undone.`)) {
      console.log("User cancelled delete operation");
      return;
    }

    try {
      console.log("Attempting to delete payee with ID:", id);
      const success = await deletePayee(id);

      if (success) {
        setEditingPayeeId(null);
        showSuccessToast(`Payee "${payeeName}" deleted successfully`);
        console.log("Payee deleted successfully");
      } else {
        const errorMessage = payeesError || "Failed to delete payee. Please try again.";
        console.error("Delete payee failed:", errorMessage);
        showErrorToast(errorMessage);
      }
    } catch (error) {
      console.error("Error deleting payee:", error);
      showErrorToast("An unexpected error occurred while deleting the payee. Please try again.");
    }
  };

  const handleEdit = (account: Category) => {
    setEditingId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditParentId(account.parent_id || null);
    // Also set the refs for immediate access
    editTypeRef.current = account.type;
    editParentIdRef.current = account.parent_id || null;
  };

  const handleEditPayee = (payee: Payee) => {
    console.log("Edit payee clicked for:", payee.name, "ID:", payee.id);
    setEditingPayeeId(payee.id);
    setEditPayeeName(payee.name);
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    // Get current values from React state since we're using React components
    const getCurrentValues = () => {
      // Get the name from the input field in the DOM as it might have been changed
      let name = editName;
      if (categoriesTableRef.current) {
        const nameInput = categoriesTableRef.current.querySelector('tr input[type="text"]') as HTMLInputElement;
        if (nameInput) {
          name = nameInput.value || editName;
        }
      }

      // Use refs for both type and parent since changes need immediate access
      let parent_id = editParentIdRef.current;
      const type = editTypeRef.current;

      // Convert empty string to null (for "No Parent" selection)
      if (parent_id === "" || parent_id === undefined || parent_id === "null") {
        parent_id = null;
      }

      // Validate parent type matches category type - if not, clear parent
      if (parent_id) {
        const parentCategory = accounts.find((acc) => acc.id === parent_id);
        if (parentCategory && parentCategory.type !== type) {
          parent_id = null;
        }
      }

      return {
        name,
        type,
        parent_id: parent_id as string | null,
      };
    };

    const currentValues = getCurrentValues();
    const editingIdToUpdate = editingId;

    // Get the original category to compare values
    const originalCategory = accounts.find((acc) => acc.id === editingIdToUpdate);
    if (!originalCategory) {
      setEditingId(null);
      return;
    }

    // Check if any values have actually changed
    const hasChanges =
      originalCategory.name !== currentValues.name ||
      originalCategory.type !== currentValues.type ||
      (originalCategory.parent_id || null) !== currentValues.parent_id;

    // Immediately exit editing mode
    setEditingId(null);

    // If no changes were made, just return without highlighting
    if (!hasChanges) {
      return;
    }

    try {
      // Use the new store method that handles merge detection
      const result = await updateCategoryWithMergeCheck(editingIdToUpdate, {
        name: currentValues.name,
        type: currentValues.type,
        parent_id: currentValues.parent_id === "" ? null : currentValues.parent_id,
      });

      if (result) {
        // Success
        setEditingId(null);
        await fetchParentOptions();
      } else {
        alert("Error saving changes. Please try again.");
      }

      // If this chart of accounts entry is linked to a plaid account, also update the accounts table
      const { data: currentAccount, error: fetchError } = await supabase
        .from("chart_of_accounts")
        .select("plaid_account_id")
        .eq("id", editingIdToUpdate)
        .single();

      if (!fetchError && currentAccount?.plaid_account_id) {
        const { error: accountsError } = await supabase
          .from("accounts")
          .update({
            name: currentValues.name,
            type: currentValues.type,
          })
          .eq("plaid_account_id", currentAccount.plaid_account_id)
          .eq("company_id", currentCompany!.id);

        if (accountsError) {
          console.error("Error updating accounts table:", accountsError);
          // Don't return here as the main update succeeded
        }
      }

      await fetchParentOptions();
    } catch (error) {
      console.error("Unexpected error during update:", error);
      alert("An unexpected error occurred. Please try again.");
    }
  };

  // Handle clicks outside the table or on other rows to save changes
  useEffect(() => {
    const handleClickToSave = (event: MouseEvent) => {
      if (!editingId || !categoriesTableRef.current) return;

      const target = event.target as Element;

      // Check if the click is on a Select dropdown or its components
      const isSelectDropdown =
        target.closest(".react-select__control") ||
        target.closest(".react-select__dropdown-indicator") ||
        target.closest(".react-select__menu") ||
        target.closest(".react-select__menu-list") ||
        target.closest(".react-select__option") ||
        target.closest(".react-select__input") ||
        target.closest('[class*="react-select"]') ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="option"]') ||
        target.closest('[role="combobox"]');

      // If clicking on Select dropdown, don't save
      if (isSelectDropdown) {
        return;
      }

      // If click is outside the table, save
      if (!categoriesTableRef.current.contains(target)) {
        handleUpdate();
        return;
      }

      // If click is inside the table, check if it's on a different row
      const clickedRow = target.closest("tr");
      if (clickedRow) {
        // Get all the input/select elements in the currently editing row
        const editingInputs = categoriesTableRef.current.querySelectorAll(`tr input[type="text"], tr select`);

        // Also check for Select components by looking for the editing row ID
        const editingRow = categoriesTableRef.current.querySelector(
          `tr:has(input[type="text"]:focus), tr:has(.react-select__control)`
        );

        // Check if the clicked element is one of the editing inputs or within the editing row
        const isClickOnCurrentEditingElement =
          Array.from(editingInputs).some((input) => input.contains(target) || input === target) ||
          (editingRow && editingRow.contains(target));

        // If not clicking on the current editing elements, save
        if (!isClickOnCurrentEditingElement) {
          handleUpdate();
        }
      }
    };

    document.addEventListener("mousedown", handleClickToSave);
    return () => {
      document.removeEventListener("mousedown", handleClickToSave);
    };
  }, [editingId]);

  // Handle clicks outside payee input to save changes
  useEffect(() => {
    const handlePayeeClickToSave = (event: MouseEvent) => {
      if (!editingPayeeId) return;

      const target = event.target as Element;

      // Check if the click is on the current editing payee input
      const editingInput = document.querySelector('tr input[type="text"]:focus') as HTMLInputElement;

      // If clicking on the current editing input, don't save
      if (editingInput && (editingInput.contains(target) || editingInput === target)) {
        return;
      }

      // Check if clicking on Save or Delete buttons - don't auto-save in these cases
      if (target.tagName === "BUTTON") {
        const buttonText = target.textContent?.trim();
        if (buttonText === "Save" || buttonText === "Delete") {
          console.log("Clicked on action button, not auto-saving:", buttonText);
          return;
        }
      }

      // Otherwise, save the changes
      console.log("Auto-saving payee changes due to click outside");
      handleUpdatePayee();
    };

    document.addEventListener("mousedown", handlePayeeClickToSave);
    return () => {
      document.removeEventListener("mousedown", handlePayeeClickToSave);
    };
  }, [editingPayeeId]);

  const handleUpdatePayee = async () => {
    if (!editingPayeeId) return;

    // Get the current value from the input field
    const getCurrentValue = () => {
      // Get the name from the DOM input field as it might have been changed
      const editingRow = document.querySelector(`tr:has(input[type="text"]:focus)`);
      if (editingRow) {
        const nameInput = editingRow.querySelector('input[type="text"]') as HTMLInputElement;
        if (nameInput) {
          return nameInput.value.trim();
        }
      }
      return editPayeeName.trim();
    };

    const currentValue = getCurrentValue();
    const editingPayeeIdToUpdate = editingPayeeId;

    // Get the original payee to compare values
    const originalPayee = payees.find((payee) => payee.id === editingPayeeIdToUpdate);
    if (!originalPayee) {
      setEditingPayeeId(null);
      return;
    }

    // Check if the name has actually changed
    const hasChanges = originalPayee.name !== currentValue;

    // Immediately exit editing mode
    setEditingPayeeId(null);

    // If no changes were made, just return without highlighting
    if (!hasChanges) {
      return;
    }

    try {
      // Update using the store
      const success = await updatePayee(editingPayeeIdToUpdate, currentValue);

      if (!success) {
        alert(payeesError || "Error saving changes. Please try again.");
        return;
      }
    } catch (error) {
      console.error("Unexpected error during payee update:", error);
      alert("An unexpected error occurred. Please try again.");
    }
  };

  // Merge categories functionality
  const handleMergeCategories = async () => {
    if (mergeModal.selectedCategories.size < 2 || !mergeModal.targetCategoryId || !currentCompany?.id) {
      setMergeModal((prev) => ({
        ...prev,
        error: "Please select at least 2 categories to merge and choose a target category.",
      }));
      return;
    }

    setMergeModal((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const selectedCategoryIds = Array.from(mergeModal.selectedCategories);
      const success = await mergeCategories(selectedCategoryIds, mergeModal.targetCategoryId!);

      if (success) {
        // Success - close modal
        setMergeModal({
          isOpen: false,
          selectedCategories: new Set(),
          targetCategoryId: null,
          isLoading: false,
          error: null,
          searchTerm: "",
        });

        // Refresh parent options for form dropdowns
        await fetchParentOptions();
      } else {
        // Error is already set by the store
        setMergeModal((prev) => ({
          ...prev,
          isLoading: false,
          error: categoriesError || "Failed to merge categories. Please try again.",
        }));
      }
    } catch (error) {
      console.error("Error in handleMergeCategories:", error);
      setMergeModal((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to merge categories. Please try again.",
      }));
    }
  };

  const downloadCategoriesTemplate = () => {
    const csvContent =
      "Name,Type,Parent\nOperating Expenses,Expense,\nOffice Supplies,Expense,Operating Expenses\nUtilities,Expense,Operating Expenses\nBank Fees,Expense,\nAdvertising,Expense,\nCurrent Assets,Asset,\nCash,Asset,Current Assets\nAccounts Receivable,Asset,Current Assets\nSales Revenue,Revenue,\nService Revenue,Revenue,";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "categories_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadPayeesTemplate = () => {
    const csvContent =
      "Name\nOffice Depot\nAT&T Business\nAmazon Business\nStaples\nFedEx\nUPS\nMicrosoft Corporation\nGoogle Workspace\nCity Water & Power\nWaste Management Inc.";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payees_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportCategories = () => {
    if (!accounts.length) return;

    const csvData = accounts.map((account) => {
      const parentAccount = account.parent_id ? accounts.find((acc) => acc.id === account.parent_id) : null;
      return {
        Name: account.name,
        Type: account.type,
        Parent: parentAccount?.name || "",
      };
    });

    const csvContent = Papa.unparse(csvData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `categories_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPayees = () => {
    if (!payees.length) return;

    const csvData = payees.map((payee) => ({
      Name: payee.name,
    }));

    const csvContent = Papa.unparse(csvData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payees_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Import validation functions
  const validateCategoryCSV = (data: Papa.ParseResult<CategoryCSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name", "Type"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: Name, Type, Parent (optional)`;
    }

    const nonEmptyRows = data.data.filter((row) => row.Name && row.Type);

    if (nonEmptyRows.length === 0) {
      return "No valid category data found. Please ensure you have at least one row with Name and Type.";
    }

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each category.`;
      }

      if (!ACCOUNT_TYPES.includes(row.Type)) {
        return `Invalid type "${row.Type}" in row ${i + 1}. Valid types are: ${ACCOUNT_TYPES.join(", ")}`;
      }
    }

    return null;
  };

  // Validate parent references and detect missing parents
  const validateParentReferences = (categories: CategoryImportData[]): CategoryImportData[] => {
    return categories.map((category) => {
      let isValid = true;
      let validationMessage = "";
      let needsParentCreation = false;

      // Check for name uniqueness - must not exist in database
      const nameExistsInDb = accounts.some((acc) => acc.name.toLowerCase() === category.name.toLowerCase());

      if (nameExistsInDb) {
        isValid = false;
        validationMessage = `Category "${category.name}" already exists in database`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Check for name uniqueness within CSV data
      const duplicatesInCsv = categories.filter((cat) => cat.name.toLowerCase() === category.name.toLowerCase());

      if (duplicatesInCsv.length > 1) {
        isValid = false;
        validationMessage = `Duplicate name "${category.name}" found in CSV`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Validate parent references
      if (category.parentName) {
        // Check if parent exists in current accounts
        const parentExists = accounts.some((acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase());

        // Check if parent exists in the import data
        const parentInImport = categories.find(
          (cat) => cat.name.toLowerCase() === category.parentName!.toLowerCase() && cat.id !== category.id
        );

        if (!parentExists && !parentInImport) {
          needsParentCreation = true;
          validationMessage = `Parent "${category.parentName}" does not exist`;
        } else if (parentExists || parentInImport) {
          // Validate that parent type matches (parents must have same type as child)
          const existingParent = accounts.find((acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase());
          const importParent = parentInImport;

          const parentType = existingParent?.type || importParent?.type;
          if (parentType && parentType !== category.type) {
            isValid = false;
            validationMessage = `Parent "${category.parentName}" has type "${parentType}" but child has type "${category.type}". Parent and child must have the same type.`;
          }
        }

        // Check if parent is in CSV but not selected for import
        if (parentInImport) {
          // This will be handled at the selection level, not here
          // We'll add this check when user tries to import
        }
      }

      return {
        ...category,
        isValid,
        validationMessage,
        needsParentCreation,
      };
    });
  };

  // Validate that if a parent is in the CSV, it must be selected if its children are selected
  const validateParentDependencies = (
    categories: CategoryImportData[],
    selectedIds: Set<string>
  ): { isValid: boolean; missingParents: string[] } => {
    const missingParents: string[] = [];

    const selectedCategories = categories.filter((cat) => selectedIds.has(cat.id));

    for (const category of selectedCategories) {
      if (category.parentName) {
        // Find if the parent is in the CSV data
        const parentInCsv = categories.find((cat) => cat.name.toLowerCase() === category.parentName!.toLowerCase());

        // If parent is in CSV but not selected, add to missing parents
        if (parentInCsv && !selectedIds.has(parentInCsv.id)) {
          if (!missingParents.includes(category.parentName)) {
            missingParents.push(category.parentName);
          }
        }
      }
    }

    return {
      isValid: missingParents.length === 0,
      missingParents,
    };
  };

  const validatePayeeCSV = (data: Papa.ParseResult<PayeeCSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: Name`;
    }

    const nonEmptyRows = data.data.filter((row) => row.Name);

    if (nonEmptyRows.length === 0) {
      return "No valid payee data found. Please ensure you have at least one row with Name.";
    }

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each payee.`;
      }
    }

    return null;
  };

  // Import file handling functions
  const handleCategoryFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent ? event.dataTransfer?.files[0] : event.target.files?.[0];

    if (!file) return;

    setCategoryImportModal((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CategoryCSVRow>) => {
        const error = validateCategoryCSV(results);
        if (error) {
          setCategoryImportModal((prev) => ({
            ...prev,
            isLoading: false,
            error,
          }));
          return;
        }

        const categories: CategoryImportData[] = results.data
          .filter((row: CategoryCSVRow) => row.Name && row.Type)
          .map((row: CategoryCSVRow) => {
            const parentCategory = row["Parent"] ? accounts.find((acc) => acc.name === row["Parent"]) : null;

            return {
              id: uuidv4(),
              name: row.Name.trim(),
              type: row.Type,
              parent_id: parentCategory?.id || null,
              company_id: currentCompany?.id || "",
              parentName: row.Parent?.trim() || undefined,
              // Initialize validation fields - will be populated by validateParentReferences
              isValid: true,
              validationMessage: "",
              needsParentCreation: false,
            };
          });

        // Validate parent references
        const validatedCategories = validateParentReferences(categories);

        setCategoryImportModal((prev) => ({
          ...prev,
          isLoading: false,
          csvData: validatedCategories,
          step: "review",
        }));
      },
      error: (error) => {
        setCategoryImportModal((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`,
        }));
      },
    });
  };

  const handlePayeeFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent ? event.dataTransfer?.files[0] : event.target.files?.[0];

    if (!file) return;

    setPayeeImportModal((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<PayeeCSVRow>) => {
        const error = validatePayeeCSV(results);
        if (error) {
          setPayeeImportModal((prev) => ({
            ...prev,
            isLoading: false,
            error,
          }));
          return;
        }

        const payeeData = results.data
          .filter((row: PayeeCSVRow) => row.Name)
          .map((row: PayeeCSVRow) => {
            const name = row.Name.trim();

            // Check if payee already exists in database (case-insensitive)
            const existsInDb = payees.some((payee) => payee.name.toLowerCase() === name.toLowerCase());

            // Check for duplicates within CSV data
            const duplicatesInCsv = results.data.filter(
              (csvRow: PayeeCSVRow) => csvRow.Name && csvRow.Name.trim().toLowerCase() === name.toLowerCase()
            );

            return {
              id: uuidv4(),
              name,
              company_id: currentCompany?.id || "",
              isValid: !existsInDb && duplicatesInCsv.length === 1,
              validationMessage: existsInDb
                ? `Payee "${name}" already exists in database`
                : duplicatesInCsv.length > 1
                ? `Duplicate payee "${name}" found in CSV`
                : "",
            };
          });

        setPayeeImportModal((prev) => ({
          ...prev,
          isLoading: false,
          csvData: payeeData,
          step: "review",
        }));
      },
      error: (error) => {
        setPayeeImportModal((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`,
        }));
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCategoryDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleCategoryFileUpload(event);
    }
  };

  const handlePayeeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handlePayeeFileUpload(event);
    }
  };

  // Helper to display subaccounts indented with AI highlighting
  const renderAccounts = (accounts: Category[], level = 0) => {
    // Get all parent accounts
    const parentAccounts = accounts.filter((acc) => acc.parent_id === null);

    return parentAccounts
      .flatMap((parent) => {
        // Get subaccounts for this parent
        const subAccounts = accounts.filter((acc) => acc.parent_id === parent.id);

        // If there are no subaccounts and parent doesn't match search, don't show parent
        if (subAccounts.length === 0 && !accounts.includes(parent)) {
          return [];
        }

        // Return an array of <tr> elements: parent row + subaccount rows
        return [
          <tr
            key={parent.id}
            id={`category-${parent.id}`}
            className={`transition-colors duration-1000 ${
              highlightedCategoryIds.has(parent.id) ? "bg-green-100" : "hover:bg-gray-50"
            }`}
          >
            <td style={{ paddingLeft: `${level * 16 + 4}px` }} className="border p-1 text-xs">
              <div className="flex items-center">
                {editingId === parent.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border-none outline-none bg-transparent text-xs"
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                    autoFocus
                  />
                ) : (
                  <span className={highlightedCategoryIds.has(parent.id) ? "font-bold text-green-800" : ""}>
                    {parent.name}
                  </span>
                )}
                {lastActionCategoryId === parent.id && (
                  <span className="ml-2 inline-block text-green-600 flex-shrink-0">✨</span>
                )}
              </div>
            </td>
            <td className="border p-1 text-xs">
              {editingId === parent.id ? (
                <Select
                  options={typeOptions}
                  value={typeOptions.find((opt) => opt.value === editType) || typeOptions[0]}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option) {
                      setEditType(option.value);
                      editTypeRef.current = option.value; // Store in ref for immediate access
                      // Clear parent when type changes since parent must match type
                      setEditParentId(null);
                      editParentIdRef.current = null;
                    }
                  }}
                  isSearchable
                  className="w-full"
                  classNames={{
                    container: () => "w-full",
                    control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                    input: () => "w-px",
                    valueContainer: () => "px-1 py-0.5 h-7",
                    indicatorsContainer: () => "h-7",
                    indicatorSeparator: () => "bg-gray-300",
                    dropdownIndicator: () => "text-gray-500 p-1",
                  }}
                />
              ) : (
                parent.type
              )}
            </td>
            <td className="border p-1 text-xs">
              {editingId === parent.id ? (
                <Select
                  options={getParentOptions(parent.id, editType)}
                  value={
                    getParentOptions(parent.id, editType).find((opt) => opt.value === (editParentId || "")) ||
                    getParentOptions(parent.id, editType)[0]
                  }
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option) {
                      const newParentId = option.value === "" ? null : option.value;
                      setEditParentId(newParentId);
                      editParentIdRef.current = newParentId; // Store in ref for immediate access
                    }
                  }}
                  isSearchable
                  className="w-full"
                  classNames={{
                    container: () => "w-full",
                    control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                    input: () => "w-px",
                    valueContainer: () => "px-1 py-0.5 h-7",
                    indicatorsContainer: () => "h-7",
                    indicatorSeparator: () => "bg-gray-300",
                    dropdownIndicator: () => "text-gray-500 p-1",
                  }}
                />
              ) : (
                ""
              )}
            </td>
            <td className="border p-1 text-xs">
              <div className="flex gap-2 justify-center">
                {editingId === parent.id ? (
                  <>
                    <button onClick={handleUpdate} className="text-xs hover:underline text-blue-600">
                      Save
                    </button>
                    <button onClick={() => handleDelete(parent.id)} className="text-xs hover:underline text-red-600">
                      Delete
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleEdit(parent)} className="text-xs hover:underline text-blue-600">
                    Edit
                  </button>
                )}
              </div>
            </td>
          </tr>,
          ...subAccounts.map((subAcc) => (
            <tr
              key={subAcc.id}
              id={`category-${subAcc.id}`}
              className={`transition-colors duration-1000 ${
                highlightedCategoryIds.has(subAcc.id) ? "bg-green-100" : "hover:bg-gray-50"
              }`}
            >
              <td
                style={{
                  paddingLeft: `${(level + 1) * 16 + 4}px`,
                }}
                className="border p-1 text-xs"
              >
                <div className="flex items-center">
                  {editingId === subAcc.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border-none outline-none bg-transparent text-xs"
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                      autoFocus
                    />
                  ) : (
                    <span className={highlightedCategoryIds.has(subAcc.id) ? "font-bold text-green-800" : ""}>
                      {subAcc.name}
                    </span>
                  )}
                  {lastActionCategoryId === subAcc.id && (
                    <span className="ml-2 inline-block text-green-600 flex-shrink-0">✨</span>
                  )}
                </div>
              </td>
              <td className="border p-1 text-xs">
                {editingId === subAcc.id ? (
                  <Select
                    options={typeOptions}
                    value={typeOptions.find((opt) => opt.value === editType) || typeOptions[0]}
                    onChange={(selectedOption) => {
                      const option = selectedOption as SelectOption | null;
                      if (option) {
                        setEditType(option.value);
                        editTypeRef.current = option.value; // Store in ref for immediate access
                        // Clear parent when type changes since parent must match type
                        setEditParentId(null);
                        editParentIdRef.current = null;
                      }
                    }}
                    isSearchable
                    className="w-full"
                    classNames={{
                      container: () => "w-full",
                      control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                      input: () => "w-px",
                      valueContainer: () => "px-1 py-0.5 h-7",
                      indicatorsContainer: () => "h-7",
                      indicatorSeparator: () => "bg-gray-300",
                      dropdownIndicator: () => "text-gray-500 p-1",
                    }}
                  />
                ) : (
                  subAcc.type
                )}
              </td>
              <td className="border p-1 text-xs">
                {editingId === subAcc.id ? (
                  <Select
                    options={getParentOptions(subAcc.id, editType)}
                    value={
                      getParentOptions(subAcc.id, editType).find((opt) => opt.value === (editParentId || "")) ||
                      getParentOptions(subAcc.id, editType)[0]
                    }
                    onChange={(selectedOption) => {
                      const option = selectedOption as SelectOption | null;
                      if (option) {
                        const newParentId = option.value === "" ? null : option.value;
                        setEditParentId(newParentId);
                        editParentIdRef.current = newParentId; // Store in ref for immediate access
                      }
                    }}
                    isSearchable
                    className="w-full"
                    classNames={{
                      container: () => "w-full",
                      control: () => "w-full h-7 min-h-7 border border-gray-300 rounded text-xs",
                      input: () => "w-px", // Prevents input from expanding based on content
                      valueContainer: () => "px-1 py-0.5 h-7",
                      indicatorsContainer: () => "h-7",
                      indicatorSeparator: () => "bg-gray-300",
                      dropdownIndicator: () => "text-gray-500 p-1",
                    }}
                  />
                ) : (
                  parent.name
                )}
              </td>
              <td className="border p-1 text-xs">
                <div className="flex gap-2 justify-center">
                  {editingId === subAcc.id ? (
                    <>
                      <button onClick={handleUpdate} className="text-xs hover:underline text-blue-600">
                        Save
                      </button>
                      <button onClick={() => handleDelete(subAcc.id)} className="text-xs hover:underline text-red-600">
                        Delete
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleEdit(subAcc)} className="text-xs hover:underline text-blue-600">
                      Edit
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )),
        ];
      })
      .filter(Boolean)
      .flat(); // Remove null entries and flatten
  };

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to manage chart of accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 font-sans text-gray-900">
      <div className="flex gap-8">
        {/* Payees Section - Left Side */}
        <div className="w-2/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Payees</h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPayeeImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                Import
              </button>
              <button
                onClick={exportPayees}
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Add Payee Form */}
          <div className="mb-3">
            <form onSubmit={handleAddPayee} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Add Payee Name"
                value={newPayeeName}
                onChange={(e) => {
                  setNewPayeeName(e.target.value);
                  setPayeeError(null); // Clear error when typing
                }}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                required
              />
              <button
                type="submit"
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
            {(payeeError || payeesError) && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {payeeError || payeesError}
              </div>
            )}
          </div>

          {/* Payee Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search Payees..."
              value={payeeSearch}
              onChange={(e) => setPayeeSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Payees Table */}
          <div className="bg-white rounded shadow-sm max-h-[calc(100vh-250px)] overflow-y-auto">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th
                    className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200 w-4/5"
                    onClick={() => handlePayeeSort("name")}
                  >
                    Name {payeeSortConfig.key === "name" && (payeeSortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="border p-1 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payeesLoading ? (
                  <tr>
                    <td colSpan={2} className="text-center p-6">
                      <div className="flex items-center justify-center flex-col">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2 text-xs text-gray-500">Loading payees...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedPayees.length > 0 ? (
                  displayedPayees.map((payee) => (
                    <tr
                      key={payee.id}
                      id={`payee-${payee.id}`}
                      className={`transition-colors duration-1000 ${
                        highlightedPayeeIds.has(payee.id) ? "bg-green-100" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="border p-1 text-xs">
                        <div className="flex items-center">
                          {editingPayeeId === payee.id ? (
                            <input
                              type="text"
                              value={editPayeeName}
                              onChange={(e) => setEditPayeeName(e.target.value)}
                              className="flex-1 border-none outline-none bg-transparent text-xs"
                              onKeyDown={(e) => e.key === "Enter" && handleUpdatePayee()}
                              autoFocus
                            />
                          ) : (
                            <span className={highlightedPayeeIds.has(payee.id) ? "font-bold text-green-800" : ""}>
                              {payee.name}
                            </span>
                          )}
                          {lastActionPayeeId === payee.id && (
                            <span className="ml-2 inline-block text-green-600 flex-shrink-0">✨</span>
                          )}
                        </div>
                      </td>
                      <td className="border p-1 text-xs">
                        <div className="flex gap-2 justify-center">
                          {editingPayeeId === payee.id ? (
                            <>
                              <button onClick={handleUpdatePayee} className="text-xs hover:underline text-blue-600">
                                Save
                              </button>
                              <button
                                onClick={() => handleDeletePayee(payee.id)}
                                className="text-xs hover:underline text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleEditPayee(payee)}
                              className="text-xs hover:underline text-blue-600"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="text-center p-2 text-gray-500 text-xs">
                      No payees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Payees Pagination */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {`${displayedPayees.length} of ${payeePaginationData.totalItems} payees`}
            </span>
            <CustomPagination
              currentPage={payeeCurrentPage}
              totalPages={payeePaginationData.totalPages}
              onPageChange={setPayeeCurrentPage}
            />
          </div>
        </div>
        {/* Categories Section - Right Side */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Categories</h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setMergeModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                Merge
              </button>
              <button
                onClick={() =>
                  setCategoryImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                Import
              </button>
              <button
                onClick={exportCategories}
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Add Category Form */}
          <div className="mb-3">
            <form onSubmit={handleAddAccount} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Add Category Name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCategoryError(null); // Clear error when typing
                }}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                required
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="border border-gray-300 px-2 py-1 text-xs w-32"
                required
              >
                <option value="">Type...</option>
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={parentId || ""}
                onChange={(e) => setParentId(e.target.value || null)}
                className="border border-gray-300 px-2 py-1 text-xs flex-1"
              >
                <option value="">No Parent</option>
                {parentOptions
                  .filter((opt) => opt.type === newType || !newType)
                  .map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.type})
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
            {(categoryError || categoriesError) && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                {categoryError || categoriesError}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search Categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Categories Table */}
          <div
            className="bg-white rounded shadow-sm max-h-[calc(100vh-250px)] overflow-y-auto"
            ref={categoriesTableRef}
          >
            <table className="w-full border-collapse border border-gray-300 text-xs table-fixed">
              <colgroup>
                <col className="w-auto" />
                <col className="w-32" />
                <col className="w-40" />
                <col className="w-24" />
              </colgroup>
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th
                    className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => handleCategorySort("name")}
                  >
                    Name {categorySortConfig.key === "name" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => handleCategorySort("type")}
                  >
                    Type {categorySortConfig.key === "type" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => handleCategorySort("parent")}
                  >
                    Parent {categorySortConfig.key === "parent" && (categorySortConfig.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="border p-1 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center p-6">
                      <div className="flex items-center justify-center flex-col">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="ml-2 text-xs text-gray-500">Loading categories...</span>
                      </div>
                    </td>
                  </tr>
                ) : displayedCategories.length > 0 ? (
                  renderAccounts(displayedCategories)
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center p-2 text-gray-500 text-xs">
                      No categories found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Categories Pagination */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {`${displayedCategories.length} of ${categoryPaginationData.totalItems} categories`}
            </span>
            <CustomPagination
              currentPage={currentPage}
              totalPages={categoryPaginationData.totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Payee Import Modal */}
      <Dialog
        open={payeeImportModal.isOpen}
        onOpenChange={(isOpen) => setPayeeImportModal({ ...payeeImportModal, isOpen })}
      >
        <DialogContent className="min-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Payees</DialogTitle>
          </DialogHeader>

          {payeeImportModal.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
              {payeeImportModal.error}
            </div>
          )}

          {payeeImportModal.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {payeeImportModal.step === "upload" && (
                <>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                        <Button
                          variant="ghost"
                          onClick={downloadPayeesTemplate}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Download Template
                        </Button>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          <li>
                            • <strong>Name:</strong> Payee name (required)
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                      onDragOver={handleDragOver}
                      onDrop={handlePayeeDrop}
                    >
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handlePayeeFileUpload}
                        className="hidden"
                        id="payee-csv-upload"
                      />
                      <label
                        htmlFor="payee-csv-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Choose CSV File
                      </label>
                      <p className="mt-2 text-sm text-gray-500">Drag and drop your CSV file here, or click to browse</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPayeeImportModal((prev) => ({
                          ...prev,
                          isOpen: false,
                        }))
                      }
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {payeeImportModal.step === "review" && (
                <>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium text-gray-700">Review Payees</h3>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                              <input
                                type="checkbox"
                                checked={
                                  payeeImportModal.csvData.length > 0 &&
                                  payeeImportModal.selectedPayees.size === payeeImportModal.csvData.length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPayeeImportModal((prev) => ({
                                      ...prev,
                                      selectedPayees: new Set(payeeImportModal.csvData.map((payee) => payee.id)),
                                    }));
                                  } else {
                                    setPayeeImportModal((prev) => ({
                                      ...prev,
                                      selectedPayees: new Set(),
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                              />
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {payeeImportModal.csvData.map((payee) => (
                            <tr key={payee.id} className={payee.isValid === false ? "bg-red-50" : ""}>
                              <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                <input
                                  type="checkbox"
                                  checked={payeeImportModal.selectedPayees.has(payee.id)}
                                  disabled={payee.isValid === false}
                                  onChange={(e) => {
                                    const newSelected = new Set(payeeImportModal.selectedPayees);
                                    if (e.target.checked) {
                                      newSelected.add(payee.id);
                                    } else {
                                      newSelected.delete(payee.id);
                                    }
                                    setPayeeImportModal((prev) => ({
                                      ...prev,
                                      selectedPayees: newSelected,
                                    }));
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 disabled:opacity-50"
                                />
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">{payee.name}</td>
                              <td className="px-4 py-2 text-sm">
                                {payee.isValid === false ? (
                                  <div className="flex items-center space-x-1">
                                    <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0"></span>
                                    <span className="text-red-700 text-xs">{payee.validationMessage}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1">
                                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                    <span className="text-green-700 text-xs">Valid</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">
                      {payeeImportModal.selectedPayees.size > 0 && (
                        <span className="text-gray-600">{payeeImportModal.selectedPayees.size} selected</span>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setPayeeImportModal((prev) => ({
                            ...prev,
                            step: "upload",
                          }))
                        }
                      >
                        Back
                      </Button>
                      <Button
                        onClick={async () => {
                          setPayeeImportModal((prev) => ({
                            ...prev,
                            isLoading: true,
                            error: null,
                          }));
                          try {
                            if (!currentCompany) {
                              throw new Error("No company selected. Please select a company first.");
                            }

                            const selectedPayees = payeeImportModal.csvData.filter((payee) =>
                              payeeImportModal.selectedPayees.has(payee.id)
                            );

                            if (selectedPayees.length === 0) {
                              throw new Error("No payees selected for import.");
                            }

                            // Filter out invalid payees
                            const validPayees = selectedPayees.filter((payee) => payee.isValid !== false);
                            const invalidPayees = selectedPayees.filter((payee) => payee.isValid === false);

                            if (invalidPayees.length > 0 && validPayees.length > 0) {
                              const proceed = window.confirm(
                                `${invalidPayees.length} selected payee${
                                  invalidPayees.length === 1 ? "" : "s"
                                } already exist or have validation errors and will be skipped.\n\n` +
                                  `Only ${validPayees.length} valid payee${
                                    validPayees.length === 1 ? "" : "s"
                                  } will be imported.\n\n` +
                                  `Click OK to proceed with valid payees only, or Cancel to go back.`
                              );

                              if (!proceed) {
                                setPayeeImportModal((prev) => ({
                                  ...prev,
                                  isLoading: false,
                                }));
                                return;
                              }
                            } else if (validPayees.length === 0) {
                              throw new Error(
                                "All selected payees already exist or have validation errors. Please select only valid payees."
                              );
                            }

                            const payeesToInsert = validPayees.map((payee) => ({
                              name: payee.name,
                              company_id: currentCompany.id,
                            }));

                            const { error } = await supabase.from("payees").insert(payeesToInsert);

                            if (error) {
                              throw new Error(error.message);
                            }

                            setPayeeImportModal({
                              isOpen: false,
                              step: "upload",
                              csvData: [],
                              isLoading: false,
                              error: null,
                              selectedPayees: new Set(),
                            });

                            // Payees refreshed automatically by store
                          } catch (error) {
                            setPayeeImportModal((prev) => ({
                              ...prev,
                              isLoading: false,
                              error:
                                error instanceof Error ? error.message : "Failed to import payees. Please try again.",
                            }));
                          }
                        }}
                      >
                        Import Payees
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Import Modal */}
      <Dialog
        open={categoryImportModal.isOpen}
        onOpenChange={(open) => setCategoryImportModal((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="min-w-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Categories</DialogTitle>
          </DialogHeader>

          {categoryImportModal.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
              {categoryImportModal.error}
            </div>
          )}

          {categoryImportModal.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {categoryImportModal.step === "upload" && (
                <>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                        <Button
                          variant="ghost"
                          onClick={downloadCategoriesTemplate}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Download Template
                        </Button>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          <li>
                            • <strong>Name:</strong> Category name (required)
                          </li>
                          <li>
                            • <strong>Type:</strong> One of: {ACCOUNT_TYPES.join(", ")}
                          </li>
                          <li>
                            • <strong>Parent:</strong> Name of parent category (optional)
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                      onDragOver={handleDragOver}
                      onDrop={handleCategoryDrop}
                    >
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCategoryFileUpload}
                        className="hidden"
                        id="category-csv-upload"
                      />
                      <label
                        htmlFor="category-csv-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Choose CSV File
                      </label>
                      <p className="mt-2 text-sm text-gray-500">Drag and drop your CSV file here, or click to browse</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCategoryImportModal((prev) => ({
                          ...prev,
                          isOpen: false,
                        }))
                      }
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {categoryImportModal.step === "review" && (
                <>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium text-gray-700">Review Categories</h3>
                    </div>

                    {/* Missing parents warning and options */}
                    {categoryImportModal.csvData.some((cat) => cat.needsParentCreation) && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-yellow-800 mb-2">Missing Parent Categories Detected</h4>
                        <p className="text-sm text-yellow-700 mb-3">
                          Some categories reference parent categories that don&apos;t exist in your system.
                        </p>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={categoryImportModal.autoCreateMissing}
                            onChange={(e) =>
                              setCategoryImportModal((prev) => ({
                                ...prev,
                                autoCreateMissing: e.target.checked,
                              }))
                            }
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                          />
                          <span className="text-sm text-yellow-700">
                            Automatically create missing parent categories during import (with same type as child)
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Parent dependency warning */}
                    {(() => {
                      const dependencyCheck = validateParentDependencies(
                        categoryImportModal.csvData,
                        categoryImportModal.selectedCategories
                      );

                      return (
                        !dependencyCheck.isValid && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <h4 className="text-sm font-medium text-orange-800 mb-2">Parent Dependencies Required</h4>
                            <p className="text-sm text-orange-700 mb-2">
                              Some selected categories have parents that are also in this CSV but not selected for
                              import:
                            </p>
                            <ul className="text-sm text-orange-700 list-disc list-inside">
                              {dependencyCheck.missingParents.map((parentName) => (
                                <li key={parentName}>
                                  <strong>{parentName}</strong> - Must be selected to import its children
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      );
                    })()}
                    <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                              <input
                                type="checkbox"
                                checked={
                                  categoryImportModal.csvData.length > 0 &&
                                  categoryImportModal.selectedCategories.size === categoryImportModal.csvData.length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Select all categories
                                    setCategoryImportModal((prev) => ({
                                      ...prev,
                                      selectedCategories: new Set(categoryImportModal.csvData.map((cat) => cat.id)),
                                    }));
                                  } else {
                                    // Deselect all categories
                                    setCategoryImportModal((prev) => ({
                                      ...prev,
                                      selectedCategories: new Set(),
                                    }));
                                  }
                                }}
                                className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                              />
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Parent
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {categoryImportModal.csvData.map((category) => (
                            <tr
                              key={category.id}
                              className={`${
                                category.needsParentCreation && !categoryImportModal.autoCreateMissing
                                  ? "bg-yellow-50"
                                  : !category.isValid
                                  ? "bg-red-50"
                                  : ""
                              }`}
                            >
                              <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                <input
                                  type="checkbox"
                                  checked={categoryImportModal.selectedCategories.has(category.id)}
                                  onChange={(e) => {
                                    const newSelected = new Set(categoryImportModal.selectedCategories);
                                    if (e.target.checked) {
                                      newSelected.add(category.id);

                                      // Auto-select parent if it's in the CSV
                                      if (category.parentName) {
                                        const parentInCsv = categoryImportModal.csvData.find(
                                          (cat) => cat.name.toLowerCase() === category.parentName!.toLowerCase()
                                        );
                                        if (parentInCsv) {
                                          newSelected.add(parentInCsv.id);
                                        }
                                      }
                                    } else {
                                      newSelected.delete(category.id);

                                      // Auto-deselect children if this is a parent
                                      const childrenInCsv = categoryImportModal.csvData.filter(
                                        (cat) =>
                                          cat.parentName && cat.parentName.toLowerCase() === category.name.toLowerCase()
                                      );
                                      childrenInCsv.forEach((child) => {
                                        newSelected.delete(child.id);
                                      });
                                    }
                                    setCategoryImportModal((prev) => ({
                                      ...prev,
                                      selectedCategories: newSelected,
                                    }));
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">{category.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{category.type}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{category.parentName || "-"}</td>
                              <td className="px-4 py-2 text-sm">
                                {!category.isValid ? (
                                  <div className="flex items-center space-x-1">
                                    <span className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0"></span>
                                    <span className="text-red-700 text-xs">{category.validationMessage}</span>
                                  </div>
                                ) : category.needsParentCreation ? (
                                  categoryImportModal.autoCreateMissing ? (
                                    <div className="flex items-center space-x-1">
                                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                      <span className="text-blue-700 text-xs">Will create parent</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-1">
                                      <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                                      <span className="text-orange-700 text-xs">Missing parent</span>
                                    </div>
                                  )
                                ) : (
                                  <div className="flex items-center space-x-1">
                                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                    <span className="text-green-700 text-xs">Valid</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">
                      {categoryImportModal.selectedCategories.size > 0 && (
                        <>
                          <span className="text-gray-600">{categoryImportModal.selectedCategories.size} selected</span>
                          {!categoryImportModal.autoCreateMissing &&
                            (() => {
                              const selectedCategories = categoryImportModal.csvData.filter((cat) =>
                                categoryImportModal.selectedCategories.has(cat.id)
                              );
                              const validCount = selectedCategories.filter(
                                (cat) => cat.isValid && !cat.needsParentCreation
                              ).length;
                              const invalidCount = selectedCategories.filter(
                                (cat) => !cat.isValid || cat.needsParentCreation
                              ).length;

                              return invalidCount > 0 ? (
                                <span className="text-red-600 ml-2">
                                  ({validCount} will import, {invalidCount} will skip)
                                </span>
                              ) : null;
                            })()}
                        </>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <button
                        onClick={() =>
                          setCategoryImportModal((prev) => ({
                            ...prev,
                            step: "upload",
                          }))
                        }
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Back
                      </button>
                      <button
                        onClick={async () => {
                          setCategoryImportModal((prev) => ({
                            ...prev,
                            isLoading: true,
                            error: null,
                          }));
                          try {
                            if (!currentCompany) {
                              throw new Error("No company selected. Please select a company first.");
                            }

                            const selectedCategories = categoryImportModal.csvData.filter((cat) =>
                              categoryImportModal.selectedCategories.has(cat.id)
                            );

                            if (selectedCategories.length === 0) {
                              throw new Error("No categories selected for import.");
                            }

                            // Check for parent dependencies
                            const dependencyCheck = validateParentDependencies(
                              categoryImportModal.csvData,
                              categoryImportModal.selectedCategories
                            );

                            if (!dependencyCheck.isValid) {
                              throw new Error(
                                `Cannot import: The following parent categories are in the CSV but not selected: ${dependencyCheck.missingParents.join(
                                  ", "
                                )}. Please select them or deselect their children.`
                              );
                            }

                            // If auto-create is enabled, create missing parent categories first
                            if (categoryImportModal.autoCreateMissing) {
                              const missingParents = new Set<string>();

                              selectedCategories.forEach((cat) => {
                                if (cat.needsParentCreation && cat.parentName) {
                                  missingParents.add(cat.parentName);
                                }
                              });

                              // Create missing parent categories with same type as child
                              if (missingParents.size > 0) {
                                const parentsToCreate = Array.from(missingParents).map((parentName) => {
                                  // Find a child category to get the type
                                  const childWithThisParent = selectedCategories.find(
                                    (cat) => cat.parentName === parentName
                                  );
                                  return {
                                    name: parentName,
                                    type: childWithThisParent?.type || "Expense", // Default to Expense if can't determine
                                    parent_id: null, // These are parent categories
                                    company_id: currentCompany.id,
                                  };
                                });

                                const { error: parentError } = await supabase
                                  .from("chart_of_accounts")
                                  .insert(parentsToCreate);

                                if (parentError) {
                                  throw new Error(`Failed to create parent categories: ${parentError.message}`);
                                }

                                // Refresh accounts list to get the newly created parents
                                await refreshCategories();
                              }
                            } else {
                              // If not auto-creating, filter out categories that need parent creation or are invalid
                              const validCategories = selectedCategories.filter(
                                (cat) => cat.isValid && !cat.needsParentCreation
                              );
                              const invalidCategories = selectedCategories.filter(
                                (cat) => !cat.isValid || cat.needsParentCreation
                              );

                              if (invalidCategories.length > 0 && validCategories.length > 0) {
                                // Mixed selection - show confirmation
                                const proceed = window.confirm(
                                  `${invalidCategories.length} selected categor${
                                    invalidCategories.length === 1 ? "y" : "ies"
                                  } reference missing parents or have validation errors and will be skipped.\n\n` +
                                    `Only ${validCategories.length} valid categor${
                                      validCategories.length === 1 ? "y" : "ies"
                                    } will be imported.\n\n` +
                                    `Click OK to proceed with valid categories only, or Cancel to go back and enable auto-creation.`
                                );

                                if (!proceed) {
                                  // User cancelled, stop the import process
                                  setCategoryImportModal((prev) => ({
                                    ...prev,
                                    isLoading: false,
                                  }));
                                  return;
                                }
                              } else if (validCategories.length === 0) {
                                // All selected categories are invalid
                                throw new Error(
                                  "All selected categories reference missing parents or have validation errors. Enable 'Auto-create missing parents' or select only valid categories."
                                );
                              }

                              // Update selectedCategories to only include valid ones
                              selectedCategories.splice(0, selectedCategories.length, ...validCategories);
                            }

                            // Sort categories to import parents before children
                            const sortCategoriesByDependency = (
                              categories: CategoryImportData[]
                            ): CategoryImportData[] => {
                              const sorted: CategoryImportData[] = [];
                              const remaining = [...categories];
                              const processing = new Set<string>();

                              const addCategoryToSorted = (cat: CategoryImportData) => {
                                if (processing.has(cat.id)) return; // Avoid circular dependencies
                                processing.add(cat.id);

                                // If category has a parent in the import list, add parent first
                                if (cat.parentName) {
                                  const parentInImport = remaining.find(
                                    (c) => c.name.toLowerCase() === cat.parentName!.toLowerCase() && c.id !== cat.id
                                  );
                                  if (parentInImport && !sorted.includes(parentInImport)) {
                                    addCategoryToSorted(parentInImport);
                                  }
                                }

                                // Add this category if not already added
                                if (!sorted.includes(cat)) {
                                  sorted.push(cat);
                                }
                                processing.delete(cat.id);
                              };

                              // Add all categories, respecting dependencies
                              for (const cat of remaining) {
                                addCategoryToSorted(cat);
                              }

                              return sorted;
                            };

                            const orderedCategories = sortCategoriesByDependency(selectedCategories);

                            // Split categories into parents and children for two-phase import
                            const parentCategories = orderedCategories.filter((cat) => !cat.parentName);
                            const childCategories = orderedCategories.filter((cat) => cat.parentName);

                            // Phase 1: Import parent categories first
                            if (parentCategories.length > 0) {
                              const parentCategoriesToInsert = parentCategories.map((cat) => ({
                                name: cat.name,
                                type: cat.type,
                                parent_id: null, // Parents have no parent
                                company_id: currentCompany.id,
                              }));

                              const { error: parentError } = await supabase
                                .from("chart_of_accounts")
                                .insert(parentCategoriesToInsert);
                              if (parentError) {
                                throw new Error(`Failed to import parent categories: ${parentError.message}`);
                              }

                              // Refresh accounts list to get newly created parents
                              await refreshCategories();
                            }

                            // Phase 2: Import child categories with proper parent_id resolution
                            if (childCategories.length > 0) {
                              const childCategoriesToInsert = await Promise.all(
                                childCategories.map(async (cat) => {
                                  let parent_id = cat.parent_id;

                                  // If we have a parentName but no parent_id, look it up (including newly created parents)
                                  if (cat.parentName && !parent_id) {
                                    // Get fresh accounts list that includes newly created parents
                                    const { data: freshAccounts } = await supabase
                                      .from("chart_of_accounts")
                                      .select("*")
                                      .eq("company_id", currentCompany.id);

                                    if (freshAccounts) {
                                      const parentAccount = freshAccounts.find(
                                        (acc) => acc.name.toLowerCase() === cat.parentName!.toLowerCase()
                                      );
                                      parent_id = parentAccount?.id || null;
                                    }
                                  }

                                  return {
                                    name: cat.name,
                                    type: cat.type,
                                    parent_id,
                                    company_id: currentCompany.id,
                                  };
                                })
                              );

                              const { error: childError } = await supabase
                                .from("chart_of_accounts")
                                .insert(childCategoriesToInsert);
                              if (childError) {
                                throw new Error(`Failed to import child categories: ${childError.message}`);
                              }
                            }

                            setCategoryImportModal({
                              isOpen: false,
                              step: "upload",
                              csvData: [],
                              isLoading: false,
                              error: null,
                              selectedCategories: new Set(),
                              autoCreateMissing: false,
                            });

                            await fetchParentOptions();
                          } catch (error) {
                            setCategoryImportModal((prev) => ({
                              ...prev,
                              isLoading: false,
                              error:
                                error instanceof Error
                                  ? error.message
                                  : "Failed to import categories. Please try again.",
                            }));
                          }
                        }}
                        className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                      >
                        Import Categories
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rename Merge Modal */}
      <Dialog
        open={renameMergeModal.isOpen}
        onOpenChange={(open) =>
          setRenameMergeModal((prev) => ({
            ...prev,
            isOpen: open,
            originalCategory: null,
            existingCategory: null,
            isLoading: false,
            error: null,
          }))
        }
      >
        <DialogContent className="min-w-[700px]">
          <DialogHeader>
            <DialogTitle>Category Name Conflict</DialogTitle>
          </DialogHeader>

          {renameMergeModal.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
              {renameMergeModal.error}
            </div>
          )}

          {renameMergeModal.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-gray-800 mb-2">
                  A category named <strong>&quot;{renameMergeModal.existingCategory?.name}&quot;</strong> already
                  exists.
                </p>
                <p className="text-gray-700">
                  Would you like to merge <strong>&quot;{renameMergeModal.originalCategory?.name}&quot;</strong> into
                  the existing category?
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">This merge will:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>
                    • Move all transactions from &quot;{renameMergeModal.originalCategory?.name}&quot; to &quot;
                    {renameMergeModal.existingCategory?.name}&quot;
                  </li>
                  <li>
                    • Move all journal entries from &quot;{renameMergeModal.originalCategory?.name}&quot; to &quot;
                    {renameMergeModal.existingCategory?.name}&quot;
                  </li>
                  <li>
                    • Move all subcategories from &quot;{renameMergeModal.originalCategory?.name}&quot; to &quot;
                    {renameMergeModal.existingCategory?.name}&quot;
                  </li>
                  <li>• Update all automation rules to use &quot;{renameMergeModal.existingCategory?.name}&quot;</li>
                  <li>• Delete &quot;{renameMergeModal.originalCategory?.name}&quot;</li>
                  <li>
                    • Keep the type and properties of &quot;{renameMergeModal.existingCategory?.name}&quot; (
                    {renameMergeModal.existingCategory?.type})
                  </li>
                </ul>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium">⚠️ This action cannot be undone.</p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setRenameMergeModal({
                      isOpen: false,
                      originalCategory: null,
                      existingCategory: null,
                      isLoading: false,
                      error: null,
                    })
                  }
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (
                      !renameMergeModal.originalCategory ||
                      !renameMergeModal.existingCategory ||
                      !currentCompany?.id
                    ) {
                      return;
                    }

                    setRenameMergeModal((prev) => ({ ...prev, isLoading: true, error: null }));

                    try {
                      // Use the specific merge from rename method
                      const success = await mergeFromRename(
                        renameMergeModal.originalCategory.id,
                        renameMergeModal.existingCategory.id
                      );

                      if (success) {
                        // Close modal on success
                        setRenameMergeModal({
                          isOpen: false,
                          originalCategory: null,
                          existingCategory: null,
                          isLoading: false,
                          error: null,
                        });

                        // Refresh parent options
                        await fetchParentOptions();
                      } else {
                        // Show error in modal
                        setRenameMergeModal((prev) => ({
                          ...prev,
                          isLoading: false,
                          error: categoriesError || "Failed to merge categories. Please try again.",
                        }));
                      }
                    } catch (error) {
                      console.error("Error during category merge:", error);
                      setRenameMergeModal((prev) => ({
                        ...prev,
                        isLoading: false,
                        error: "An unexpected error occurred during merge. Please try again.",
                      }));
                    }
                  }}
                >
                  Merge
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Categories Modal */}
      <Dialog
        open={mergeModal.isOpen}
        onOpenChange={(open) =>
          setMergeModal((prev) => ({
            ...prev,
            isOpen: open,
            selectedCategories: new Set(),
            targetCategoryId: null,
            isLoading: false,
            error: null,
            searchTerm: "",
          }))
        }
      >
        <DialogContent className="min-w-[700px]">
          <DialogHeader>
            <DialogTitle>Merge Categories</DialogTitle>
          </DialogHeader>

          {mergeModal.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{mergeModal.error}</div>
          )}

          {mergeModal.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-3 text-gray-600">Merging categories...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {mergeModal.selectedCategories.size === 0 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">How Merging Works:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Select 2 or more categories with the same type to merge</li>
                    <li>• Choose which category to keep as the &quot;target&quot; (others will be deleted)</li>
                    <li>• All subcategories from merged categories will be moved to the target</li>
                    <li>• All transaction references will be updated to point to the target category</li>
                    <li>• All journal entries will be updated to point to the target category</li>
                    <li>• All automation rules will be updated to use the target category</li>
                    <li>• Circular parent-child relationships are automatically prevented</li>
                    <li>• If merging parent categories into a subcategory, it will become a parent</li>
                  </ul>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">
                    {mergeModal.selectedCategories.size} categories selected for merge
                  </h4>
                  <p className="text-sm text-yellow-700">
                    {mergeModal.targetCategoryId
                      ? `All selected categories will be merged into "${
                          accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name
                        }".`
                      : "Please select a target category using the radio buttons below."}
                  </p>
                </div>
              )}

              {mergeModal.selectedCategories.size >= 2 && mergeModal.targetCategoryId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">This merge will:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>
                      • Move all transactions to &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </li>
                    <li>
                      • Move all journal entries to &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </li>
                    <li>
                      • Move all subcategories to &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </li>
                    <li>
                      • Update all automation rules to use &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </li>
                    <li>
                      • Delete{" "}
                      {Array.from(mergeModal.selectedCategories)
                        .filter((id) => id !== mergeModal.targetCategoryId)
                        .map((id) => `"${accounts.find((acc) => acc.id === id)?.name}"`)
                        .join(", ")}
                    </li>
                    <li>
                      • Keep the type and properties of &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </li>
                  </ul>
                </div>
              )}

              {mergeModal.selectedCategories.size >= 2 && mergeModal.targetCategoryId && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700 font-medium">⚠️ This action cannot be undone.</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Select Categories to Merge:
                  {mergeModal.selectedCategories.size > 0 && (
                    <span className="ml-2 text-xs text-gray-500">({mergeModal.selectedCategories.size} selected)</span>
                  )}
                </h3>

                {/* Search Bar */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={mergeModal.searchTerm}
                    onChange={(e) =>
                      setMergeModal((prev) => ({
                        ...prev,
                        searchTerm: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all categories of the same type as first selection, or all if none selected
                                const firstSelectedType =
                                  mergeModal.selectedCategories.size > 0
                                    ? accounts.find(
                                        (acc) =>
                                          Array.from(mergeModal.selectedCategories)[0] &&
                                          acc.id === Array.from(mergeModal.selectedCategories)[0]
                                      )?.type
                                    : null;

                                const categoriesToSelect = accounts
                                  .filter((acc) => !firstSelectedType || acc.type === firstSelectedType)
                                  .map((acc) => acc.id);

                                setMergeModal((prev) => ({
                                  ...prev,
                                  selectedCategories: new Set(categoriesToSelect),
                                  error: null,
                                }));
                              } else {
                                setMergeModal((prev) => ({
                                  ...prev,
                                  selectedCategories: new Set(),
                                  targetCategoryId: null,
                                  error: null,
                                }));
                              }
                            }}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Parent
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Keep
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accounts
                        .filter((acc) => {
                          // Filter categories to show only those with same type as selected ones
                          if (mergeModal.selectedCategories.size === 0) return true;
                          const selectedTypes = new Set(
                            Array.from(mergeModal.selectedCategories)
                              .map((id) => accounts.find((acc) => acc.id === id)?.type)
                              .filter(Boolean)
                          );
                          return selectedTypes.size === 0 || selectedTypes.has(acc.type);
                        })
                        .filter((acc) => {
                          // Filter by search term
                          if (!mergeModal.searchTerm.trim()) return true;
                          const searchLower = mergeModal.searchTerm.toLowerCase();
                          const parentCategory = acc.parent_id
                            ? accounts.find((parent) => parent.id === acc.parent_id)
                            : null;

                          return (
                            acc.name.toLowerCase().includes(searchLower) ||
                            acc.type.toLowerCase().includes(searchLower) ||
                            (parentCategory && parentCategory.name.toLowerCase().includes(searchLower))
                          );
                        })
                        .map((category) => {
                          const parentCategory = category.parent_id
                            ? accounts.find((acc) => acc.id === category.parent_id)
                            : null;

                          const isSelected = mergeModal.selectedCategories.has(category.id);
                          const isTarget = mergeModal.targetCategoryId === category.id;

                          return (
                            <tr
                              key={category.id}
                              className={`hover:bg-gray-50 ${
                                isTarget ? "bg-green-50 border-l-4 border-green-400" : isSelected ? "bg-blue-50" : ""
                              }`}
                            >
                              <td className="px-3 py-2 whitespace-nowrap w-8">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const newSelected = new Set(mergeModal.selectedCategories);
                                    if (e.target.checked) {
                                      newSelected.add(category.id);
                                    } else {
                                      newSelected.delete(category.id);
                                      // If unchecking target, clear target selection
                                      if (mergeModal.targetCategoryId === category.id) {
                                        setMergeModal((prev) => ({ ...prev, targetCategoryId: null }));
                                      }
                                    }
                                    setMergeModal((prev) => ({
                                      ...prev,
                                      selectedCategories: newSelected,
                                      error: null,
                                    }));
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm">
                                <div className="flex items-center">
                                  <span
                                    style={{ paddingLeft: `${category.parent_id ? 16 : 0}px` }}
                                    className={isTarget ? "font-semibold text-green-800" : "text-gray-900"}
                                  >
                                    {category.name}
                                  </span>
                                  {isTarget && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Target
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-900">
                                <span className={isTarget ? "font-semibold text-green-800" : ""}>{category.type}</span>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500">{parentCategory?.name || "—"}</td>
                              <td className="px-3 py-2 whitespace-nowrap w-8 text-center">
                                <input
                                  type="radio"
                                  name="targetCategory"
                                  checked={isTarget}
                                  disabled={!isSelected}
                                  onChange={() => {
                                    setMergeModal((prev) => ({
                                      ...prev,
                                      targetCategoryId: category.id,
                                      error: null,
                                    }));
                                  }}
                                  className="rounded border-gray-300 text-green-600 focus:ring-green-600 disabled:opacity-30"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {mergeModal.selectedCategories.size > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected for Merge:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(mergeModal.selectedCategories).map((id) => {
                      const category = accounts.find((acc) => acc.id === id);
                      if (!category) return null;

                      return (
                        <span
                          key={id}
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            mergeModal.targetCategoryId === id
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {category.name}
                          {mergeModal.targetCategoryId === id && " (Target)"}
                        </span>
                      );
                    })}
                  </div>
                  {mergeModal.selectedCategories.size >= 2 && !mergeModal.targetCategoryId && (
                    <p className="text-sm text-orange-600 mt-2">
                      Please select which category to keep as the target using the radio buttons.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <div className="text-sm text-gray-600">
                  {mergeModal.selectedCategories.size > 0 && mergeModal.targetCategoryId && (
                    <span>
                      Merging {mergeModal.selectedCategories.size - 1} categor
                      {mergeModal.selectedCategories.size - 1 === 1 ? "y" : "ies"} into &quot;
                      {accounts.find((acc) => acc.id === mergeModal.targetCategoryId)?.name}&quot;
                    </span>
                  )}
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMergeModal({
                        isOpen: false,
                        selectedCategories: new Set(),
                        targetCategoryId: null,
                        isLoading: false,
                        error: null,
                        searchTerm: "",
                      })
                    }
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMergeCategories}
                    disabled={mergeModal.selectedCategories.size < 2 || !mergeModal.targetCategoryId}
                  >
                    Merge
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
