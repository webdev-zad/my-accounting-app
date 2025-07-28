"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X } from "lucide-react";
import { useAIStore } from "@/zustand/aiStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";

export default function AISidePanel() {
  const {
    isPanelOpen,
    messages,
    addMessage,
    pendingAction,
    awaitingConfirmation,
    awaitingClarification,
    setPendingAction,
    clearPendingAction,
    setAwaitingClarification,
  } = useAIStore();

  const { payees, refreshPayees, addPayee, updatePayee, deletePayee, bulkDeletePayees, mergePayees, downloadPayees } =
    usePayeesStore();

  const {
    categories,
    refreshCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    bulkCreateCategories,
    bulkDeleteCategories,
    downloadCategories,
  } = useCategoriesStore();

  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [unclearResponseCount, setUnclearResponseCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isPanelOpen]);

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      addMessage({
        role: "assistant",
        content: `Hello! I'm your accounting assistant. I can help you manage payees and categories. Here's what I can do:

**Payees:**
• Create: "Add ABC Corp" or "Create John Doe"
• List: "Show all payees" or "List payees"
• Update: "Rename ABC Corp to XYZ Corp"
• Delete: "Delete ABC Corp" or "Remove John Doe"
• Bulk delete: "Delete these 5 payees"
• Merge: "Merge ABC Corp into XYZ Corp"
• Download: "Download payees"

**Categories:**
• Create: "Add Marketing as expense category"
• List: "Show expense categories" or "List income categories"
• Update: "Rename Marketing to Advertising"
• Delete: "Delete Marketing category"
• Bulk create: "Add Sales, Revenue, Income as income categories"
• Download: "Download categories"

What would you like to do?`,
      });
    }
  }, [messages.length, addMessage]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsProcessing(true);

    // Add user message
    addMessage({
      role: "user",
      content: userMessage,
    });

    try {
      // Check if user is specifying category type (income/expense) - MUST BE FIRST
      if (pendingAction?.type === "createCategory" && !pendingAction.data.type) {
        const lowerMessage = userMessage.toLowerCase();
        if (lowerMessage.includes("income")) {
          setPendingAction({
            type: "createCategory",
            data: { ...pendingAction.data, type: "Revenue" },
          });
          setAwaitingClarification(false);
          addMessage({
            role: "assistant",
            content: `Great! Would you like me to go ahead and add "${pendingAction.data.name}" as an **income category**? ✅ Confirm | ❌ Cancel`,
          });
          return;
        } else if (lowerMessage.includes("expense")) {
          setPendingAction({
            type: "createCategory",
            data: { ...pendingAction.data, type: "Expense" },
          });
          setAwaitingClarification(false);
          addMessage({
            role: "assistant",
            content: `Great! Would you like me to go ahead and add "${pendingAction.data.name}" as an **expense category**? ✅ Confirm | ❌ Cancel`,
          });
          return;
        } else {
          // If user didn't specify income/expense, ask for clarification
          addMessage({
            role: "assistant",
            content: "I'm not sure what type of category you want. Please specify 'income' or 'expense'.",
          });
          return;
        }
      }

      // If we're awaiting clarification, handle that
      if (awaitingClarification && pendingAction) {
        await handleClarification(userMessage);
        return;
      }

      // If we're awaiting confirmation, handle that (but only if it's not a new command)
      if (awaitingConfirmation && pendingAction) {
        // Check if this looks like a new command or operation
        const isNewCommand = /^(?:add|create)/i.test(userMessage);
        const isListOperation = /^(?:show|list|display)/i.test(userMessage);
        const isUpdateOperation = /^(?:rename|update|change)/i.test(userMessage);
        const isDeleteOperation = /^(?:delete|remove)/i.test(userMessage);
        const isDownloadOperation = /^(?:download)/i.test(userMessage);
        const isMergeOperation = /^(?:merge)/i.test(userMessage);
        const isClarification = /^(?:payee|category|income|expense)$/i.test(userMessage);

        if (
          isNewCommand ||
          isListOperation ||
          isUpdateOperation ||
          isDeleteOperation ||
          isDownloadOperation ||
          isMergeOperation
        ) {
          // Clear the pending action and process as new command/operation
          clearPendingAction();
          await processUserIntent(userMessage);
          return;
        } else if (isClarification) {
          // Clear the pending action and start fresh
          clearPendingAction();
          addMessage({
            role: "assistant",
            content:
              "I'm not sure what you'd like to do. You can ask me to:\n\n**Payees:**\n• Add a payee (e.g., 'Add ABC Corp')\n• List payees (e.g., 'Show all payees')\n• Update a payee (e.g., 'Rename ABC Corp to XYZ Corp')\n• Delete a payee (e.g., 'Delete ABC Corp')\n\n**Categories:**\n• Add a category (e.g., 'Add Marketing as expense category')\n• List categories (e.g., 'Show expense categories')\n• Update a category (e.g., 'Rename Marketing to Advertising')\n• Delete a category (e.g., 'Delete Marketing category')\n\nWhat would you like to do?",
          });
          return;
        } else {
          await handleConfirmation(userMessage);
          return;
        }
      }

      // Process the user's intent
      await processUserIntent(userMessage);
    } catch (error) {
      console.error("Error processing message:", error);
      addMessage({
        role: "assistant",
        content: "I'm sorry, I encountered an error. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClarification = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    if (pendingAction?.type === "createPayee" || pendingAction?.type === "createCategory") {
      if (lowerMessage.includes("payee")) {
        // User wants to create a payee
        setPendingAction({
          type: "createPayee",
          data: { name: pendingAction.data.name || "" },
        });
        addMessage({
          role: "assistant",
          content: `Great! Would you like me to add "${pendingAction.data.name}" as a new payee? ✅ Confirm | ❌ Cancel`,
        });
      } else if (lowerMessage.includes("category")) {
        // User wants to create a category
        setPendingAction({
          type: "createCategory",
          data: { name: pendingAction.data.name || "" },
        });
        addMessage({
          role: "assistant",
          content: `Got it! Should "${pendingAction.data.name}" be an **income** category or an **expense** category?`,
        });
      } else {
        addMessage({
          role: "assistant",
          content: "I'm not sure what you'd like to create. Please specify 'payee' or 'category'.",
        });
      }
    }
  };

  const handleConfirmation = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("yes") || lowerMessage.includes("confirm") || lowerMessage.includes("ok")) {
      try {
        if (pendingAction?.type === "createPayee") {
          await addPayee({ name: pendingAction.data.name || "" });
          addMessage({
            role: "assistant",
            content: `Great! I've created the payee "${pendingAction.data.name}" for you.`,
          });
        } else if (pendingAction?.type === "createCategory") {
          await addCategory({
            name: pendingAction.data.name || "",
            type: pendingAction.data.type || "Expense",
            parent_id: pendingAction.data.parent_id,
          });
          addMessage({
            role: "assistant",
            content: `Perfect! I've created the category "${
              pendingAction.data.name
            }" as a ${pendingAction.data.type?.toLowerCase()} category.`,
          });
        } else if (pendingAction?.type === "updatePayee") {
          await updatePayee(pendingAction.data.targetPayeeId || "", pendingAction.data.newName || "");
          addMessage({
            role: "assistant",
            content: `Great! I've updated the payee name to "${pendingAction.data.newName}".`,
          });
        } else if (pendingAction?.type === "updateCategory") {
          await updateCategory(pendingAction.data.targetCategoryId || "", {
            name: pendingAction.data.newName,
            type: pendingAction.data.type,
            parent_id: pendingAction.data.parent_id,
          });
          addMessage({
            role: "assistant",
            content: `Perfect! I've updated the category.`,
          });
        } else if (pendingAction?.type === "deletePayee") {
          await deletePayee(pendingAction.data.targetPayeeId || "");
          addMessage({
            role: "assistant",
            content: `Done! I've deleted the payee.`,
          });
        } else if (pendingAction?.type === "deleteCategory") {
          await deleteCategory(pendingAction.data.targetCategoryId || "");
          addMessage({
            role: "assistant",
            content: `Done! I've deleted the category.`,
          });
        } else if (pendingAction?.type === "bulkDeletePayees") {
          await bulkDeletePayees(pendingAction.data.payeeIds || []);
          addMessage({
            role: "assistant",
            content: `Done! I've deleted ${pendingAction.data.payeeIds?.length} payee(s).`,
          });
        } else if (pendingAction?.type === "bulkDeleteCategories") {
          await bulkDeleteCategories(pendingAction.data.categoryIds || []);
          addMessage({
            role: "assistant",
            content: `Done! I've deleted ${pendingAction.data.categoryIds?.length} category(ies).`,
          });
        } else if (pendingAction?.type === "bulkCreateCategories") {
          const categories =
            pendingAction.data.bulkNames?.map((name, index) => ({
              name,
              type: pendingAction.data.bulkTypes?.[index] || "Expense",
              parent_id: pendingAction.data.parent_id,
            })) || [];
          await bulkCreateCategories(categories);
          addMessage({
            role: "assistant",
            content: `Perfect! I've created ${categories.length} categories.`,
          });
        } else if (pendingAction?.type === "mergePayees") {
          await mergePayees(pendingAction.data.payeeIds?.[0] || "", pendingAction.data.targetPayeeId || "");
          addMessage({
            role: "assistant",
            content: `Done! I've merged the payees.`,
          });
        } else if (pendingAction?.type === "downloadPayees") {
          await downloadPayees();
          addMessage({
            role: "assistant",
            content: `Your payees have been downloaded as a CSV file.`,
          });
        } else if (pendingAction?.type === "downloadCategories") {
          await downloadCategories({
            type: pendingAction.data.type || undefined,
            parent_id: pendingAction.data.parent_id || undefined,
          });
          addMessage({
            role: "assistant",
            content: `Your categories have been downloaded as a CSV file.`,
          });
        }

        clearPendingAction();
        setUnclearResponseCount(0);
      } catch (error) {
        addMessage({
          role: "assistant",
          content: `I'm sorry, I couldn't complete that action. ${
            error instanceof Error ? error.message : "Please try again."
          }`,
        });
        clearPendingAction();
      }
    } else if (lowerMessage.includes("no") || lowerMessage.includes("cancel")) {
      addMessage({
        role: "assistant",
        content: "No problem! I've cancelled that action. What else can I help you with?",
      });
      clearPendingAction();
      setUnclearResponseCount(0);
    } else {
      const newCount = unclearResponseCount + 1;
      setUnclearResponseCount(newCount);

      if (newCount >= 2) {
        addMessage({
          role: "assistant",
          content:
            "I'm having trouble understanding. Let me cancel this action and start fresh. What would you like to do?",
        });
        clearPendingAction();
        setUnclearResponseCount(0);
      } else {
        addMessage({
          role: "assistant",
          content:
            "I didn't understand your response. Please confirm with 'yes' or 'no', or say 'cancel' to cancel the action.",
        });
      }
    }
  };

  const processUserIntent = async (userMessage: string) => {
    console.log("processUserIntent called with:", userMessage);
    const lowerMessage = userMessage.toLowerCase();

    // Handle specific category creation patterns first (before vague message check)
    const categoryCreateMatch = userMessage.match(
      /(?:add|create)\s+([a-zA-Z0-9\s]+?)\s+as\s+(?:a\s+)?(?:income|expense)\s+category/i
    );
    if (categoryCreateMatch) {
      console.log("Category create match found");
      const name = categoryCreateMatch[1].trim();
      const type = lowerMessage.includes("income") ? "Revenue" : "Expense";
      setPendingAction({
        type: "createCategory",
        data: { name, type },
      });
      addMessage({
        role: "assistant",
        content: `Great! Would you like me to go ahead and add "${name}" as an **${type.toLowerCase()} category**? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Handle category creation with type but without "as" keyword
    const categoryCreateSimpleMatch = userMessage.match(
      /(?:add|create)\s+([a-zA-Z0-9\s]+?)\s+(?:income|expense)\s+category/i
    );
    if (categoryCreateSimpleMatch) {
      console.log("Category create simple match found");
      const name = categoryCreateSimpleMatch[1].trim();
      const type = lowerMessage.includes("income") ? "Revenue" : "Expense";
      setPendingAction({
        type: "createCategory",
        data: { name, type },
      });
      addMessage({
        role: "assistant",
        content: `Great! Would you like me to go ahead and add "${name}" as an **${type.toLowerCase()} category**? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Handle category type/parent changes (MUST BE BEFORE bulk delete)
    const changeTypeMatch = userMessage.match(
      /(?:change|update)\s+(?:the\s+)?type\s+of\s+([a-zA-Z0-9\s]+?)\s+to\s+([a-zA-Z0-9\s]+)/i
    );
    console.log("Testing change type regex on:", userMessage);
    console.log("Change type match result:", changeTypeMatch);
    if (changeTypeMatch) {
      console.log("Change type match found:", changeTypeMatch);
      const categoryName = changeTypeMatch[1].trim();
      const newType = changeTypeMatch[2].trim();
      const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());

      if (!category) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a category named "${categoryName}". Please check the name and try again.`,
        });
        return;
      }

      // Validate the new type
      const validTypes = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

      // Handle special cases for acronyms
      let normalizedType: string;
      if (newType.toUpperCase() === "COGS") {
        normalizedType = "COGS";
      } else {
        normalizedType = newType.charAt(0).toUpperCase() + newType.slice(1).toLowerCase();
      }

      if (!validTypes.includes(normalizedType)) {
        addMessage({
          role: "assistant",
          content: `Invalid type "${newType}". Must be one of: ${validTypes.join(", ")}`,
        });
        return;
      }

      setPendingAction({
        type: "updateCategory",
        data: {
          targetCategoryId: category.id,
          type: normalizedType as
            | "Asset"
            | "Liability"
            | "Equity"
            | "Revenue"
            | "COGS"
            | "Expense"
            | "Bank Account"
            | "Credit Card",
        },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to change the type of "${categoryName}" to "${newType}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    const changeParentMatch = userMessage.match(
      /(?:change|update)\s+(?:the\s+)?parent\s+(?:category\s+)?(?:of\s+)?([a-zA-Z0-9\s]+?)\s+to\s+([a-zA-Z0-9\s]+)/i
    );
    if (changeParentMatch) {
      const categoryName = changeParentMatch[1].trim();
      const newParentName = changeParentMatch[2].trim();
      const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      const newParent = categories.find((c) => c.name.toLowerCase() === newParentName.toLowerCase());

      if (!category) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a category named "${categoryName}". Please check the name and try again.`,
        });
        return;
      }

      if (!newParent) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a parent category named "${newParentName}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "updateCategory",
        data: { targetCategoryId: category.id, parent_id: newParent.id },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to change the parent of "${categoryName}" to "${newParentName}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Handle bulk delete operations (MUST BE BEFORE payee/category checks)
    const bulkDeleteMatch = userMessage.match(
      /(?:delete|remove)\s+(?:these\s+)?(\d+)\s+(?:payees?|categories?)\s*:\s*([a-zA-Z0-9\s,]+)/i
    );
    console.log("Testing bulk delete regex on:", userMessage);
    console.log("Bulk delete match result:", bulkDeleteMatch);

    // Alternative pattern for bulk delete (without number requirement)
    const altBulkDeleteMatch = userMessage.match(
      /(?:delete|remove)\s+(?:these\s+)?(?:payees?|categories?)\s*:\s*([a-zA-Z0-9\s,]+)/i
    );
    console.log("Alternative bulk delete match result:", altBulkDeleteMatch);

    const finalBulkDeleteMatch = bulkDeleteMatch || altBulkDeleteMatch;
    if (finalBulkDeleteMatch) {
      console.log("Bulk delete match:", finalBulkDeleteMatch);
      const namesString = bulkDeleteMatch ? finalBulkDeleteMatch[2].trim() : finalBulkDeleteMatch[1].trim();
      console.log("Names string:", namesString);
      const names = namesString
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      if (names.length === 0) {
        addMessage({
          role: "assistant",
          content: "I couldn't parse the names. Please provide a comma-separated list of names.",
        });
        return;
      }

      // Check if it's payees or categories
      const isPayees = lowerMessage.includes("payee");
      const isCategories = lowerMessage.includes("categor");

      if (isPayees) {
        // Find all payees
        const payeeIds = [];
        const notFound = [];

        for (const name of names) {
          const payee = payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
          if (payee) {
            payeeIds.push(payee.id);
          } else {
            notFound.push(name);
          }
        }

        if (notFound.length > 0) {
          addMessage({
            role: "assistant",
            content: `I couldn't find these payees: ${notFound.join(", ")}. Please check the names and try again.`,
          });
          return;
        }

        setPendingAction({
          type: "bulkDeletePayees",
          data: { payeeIds },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to delete these ${payeeIds.length} payees: ${names.join(
            ", "
          )}? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else if (isCategories) {
        // Find all categories
        const categoryIds = [];
        const notFound = [];

        for (const name of names) {
          const category = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (category) {
            categoryIds.push(category.id);
          } else {
            notFound.push(name);
          }
        }

        if (notFound.length > 0) {
          addMessage({
            role: "assistant",
            content: `I couldn't find these categories: ${notFound.join(", ")}. Please check the names and try again.`,
          });
          return;
        }

        setPendingAction({
          type: "bulkDeleteCategories",
          data: { categoryIds },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to delete these ${categoryIds.length} categories: ${names.join(
            ", "
          )}? ✅ Confirm | ❌ Cancel`,
        });
        return;
      }
    }

    // Handle download operations (MUST BE BEFORE payee/category checks)
    if (lowerMessage.includes("download")) {
      console.log("Download operation detected:", userMessage);
      if (lowerMessage.includes("payee")) {
        console.log("Downloading payees");
        setPendingAction({
          type: "downloadPayees",
          data: {},
        });
        addMessage({
          role: "assistant",
          content: "I'll download your payees as a CSV file. ✅ Confirm | ❌ Cancel",
        });
        return;
      } else if (lowerMessage.includes("categor")) {
        console.log("Downloading categories");
        setPendingAction({
          type: "downloadCategories",
          data: {},
        });
        addMessage({
          role: "assistant",
          content: "I'll download your categories as a CSV file. ✅ Confirm | ❌ Cancel",
        });
        return;
      } else {
        console.log("Unclear download request");
        addMessage({
          role: "assistant",
          content: "What would you like to download? Please specify 'payees' or 'categories'.",
        });
        return;
      }
    }

    // Handle merge operations (MUST BE BEFORE payee operations)
    const mergeMatch = userMessage.match(/(?:merge)\s+([a-zA-Z0-9\s]+?)\s+(?:into|with)\s+([a-zA-Z0-9\s]+)/i);
    if (mergeMatch) {
      const sourceName = mergeMatch[1].trim();
      const targetName = mergeMatch[2].trim();

      // Check if it's payees or categories
      const isPayees = lowerMessage.includes("payee");
      const isCategories = lowerMessage.includes("categor");

      if (isPayees || !isCategories) {
        // Default to payee merge if not specified
        const sourcePayee = payees.find((p) => p.name.toLowerCase() === sourceName.toLowerCase());
        const targetPayee = payees.find((p) => p.name.toLowerCase() === targetName.toLowerCase());

        if (!sourcePayee) {
          addMessage({
            role: "assistant",
            content: `I couldn't find a payee named "${sourceName}". Please check the name and try again.`,
          });
          return;
        }

        if (!targetPayee) {
          addMessage({
            role: "assistant",
            content: `I couldn't find a payee named "${targetName}". Please check the name and try again.`,
          });
          return;
        }

        setPendingAction({
          type: "mergePayees",
          data: { payeeIds: [sourcePayee.id], targetPayeeId: targetPayee.id },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to merge "${sourceName}" into "${targetName}"? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else if (isCategories) {
        // Category merge (if implemented)
        addMessage({
          role: "assistant",
          content: "Category merging is not yet implemented. Please use payee merging instead.",
        });
        return;
      }
    }

    // Handle payee operations
    if (lowerMessage.includes("payee") || lowerMessage.includes("payees")) {
      console.log("Payee operations detected, calling handlePayeeOperations");
      await handlePayeeOperations(userMessage);
      return;
    }

    // Handle payee operations (including simple "Add [name]" for payees)
    if (lowerMessage.includes("payee") || lowerMessage.includes("payees")) {
      await handlePayeeOperations(userMessage);
      return;
    }

    // Handle simple payee creation (Add ABC Corp)
    const payeeCreateMatch = userMessage.match(/^(?:add|create)\s+([a-zA-Z0-9\s]+?)$/i);
    if (payeeCreateMatch) {
      const name = payeeCreateMatch[1].trim();
      setPendingAction({
        type: "createPayee",
        data: { name },
      });
      addMessage({
        role: "assistant",
        content: `Sure! Would you like me to add "${name}" as a new payee? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Handle single delete operations
    const deleteMatch = userMessage.match(/(?:delete|remove)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:payee|category))?$/i);
    if (deleteMatch) {
      console.log("Delete match:", deleteMatch);
      const name = deleteMatch[1].trim();
      console.log("Extracted name:", name);

      // Check if it's a payee or category by looking at existing data
      const payee = payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
      const category = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());

      if (payee) {
        setPendingAction({
          type: "deletePayee",
          data: { targetPayeeId: payee.id },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to delete the payee "${name}"? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else if (category) {
        setPendingAction({
          type: "deleteCategory",
          data: { targetCategoryId: category.id },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to delete the category "${name}"? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee or category named "${name}". Please check the name and try again.`,
        });
        return;
      }
    }

    // Handle rename/update operations (check before category keyword)
    const renameMatch = userMessage.match(
      /(?:rename|update|change)\s+([a-zA-Z0-9\s]+?)\s+(?:to|as)\s+([a-zA-Z0-9\s]+)/i
    );
    if (renameMatch) {
      const oldName = renameMatch[1].trim();
      const newName = renameMatch[2].trim();

      // Check if it's a payee or category by looking at existing data
      const payee = payees.find((p) => p.name.toLowerCase() === oldName.toLowerCase());
      const category = categories.find((c) => c.name.toLowerCase() === oldName.toLowerCase());

      if (payee) {
        setPendingAction({
          type: "updatePayee",
          data: { targetPayeeId: payee.id, newName },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to rename "${oldName}" to "${newName}"? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else if (category) {
        setPendingAction({
          type: "updateCategory",
          data: { targetCategoryId: category.id, newName },
        });
        addMessage({
          role: "assistant",
          content: `Would you like me to rename "${oldName}" to "${newName}"? ✅ Confirm | ❌ Cancel`,
        });
        return;
      } else {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee or category named "${oldName}". Please check the name and try again.`,
        });
        return;
      }
    }

    // Handle bulk create categories (MUST BE BEFORE general category operations)
    const bulkCreateMatch = userMessage.match(
      /(?:add|create)\s+(?:these\s+)?categories?\s*:\s*([a-zA-Z0-9\s,]+?)\s+as\s+(?:income|expense)\s+categories?/i
    );
    console.log("Testing bulk create regex on:", userMessage);
    console.log("Bulk create match result:", bulkCreateMatch);
    if (bulkCreateMatch) {
      const namesString = bulkCreateMatch[1].trim();
      const names = namesString
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      const type = lowerMessage.includes("income") ? "Revenue" : "Expense";

      if (names.length === 0) {
        addMessage({
          role: "assistant",
          content: "I couldn't parse the category names. Please provide a comma-separated list of names.",
        });
        return;
      }

      setPendingAction({
        type: "bulkCreateCategories",
        data: {
          bulkNames: names,
          bulkTypes: names.map(() => type),
          type: type,
        },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to create these ${names.length} categories: ${names.join(
          ", "
        )} as ${type.toLowerCase()} categories? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Handle category operations
    if (lowerMessage.includes("category") || lowerMessage.includes("categories")) {
      await handleCategoryOperations(userMessage);
      return;
    }

    // Handle list operations
    if (lowerMessage.includes("list") || lowerMessage.includes("show") || lowerMessage.includes("all")) {
      await handleListOperations(userMessage);
      return;
    }

    // Handle vague messages that need clarification (fallback for unclear cases)
    const vagueMatch = userMessage.match(/^(?:add|create)\s+([a-zA-Z0-9\s]+?)$/i);
    if (vagueMatch) {
      const name = vagueMatch[1].trim();
      setPendingAction({
        type: "createPayee",
        data: { name },
      });
      setAwaitingClarification(true);
      addMessage({
        role: "assistant",
        content: `I see you want to add "${name}". Would you like to create this as a **payee** or a **category**?`,
      });
      return;
    }

    // Default response for unclear intent
    addMessage({
      role: "assistant",
      content: `I'm not sure what you'd like me to do. You can ask me to:

**Payees:**
• Add a payee (e.g., 'Add ABC Corp' or 'Create John Doe')
• List payees (e.g., 'Show all payees')
• Update a payee (e.g., 'Rename ABC Corp to XYZ Corp')
• Delete a payee (e.g., 'Delete ABC Corp')
• Merge payees (e.g., 'Merge ABC Corp into XYZ Corp')
• Download payees

**Categories:**
• Add a category (e.g., 'Add Marketing as expense category')
• List categories (e.g., 'Show expense categories')
• Update a category (e.g., 'Rename Marketing to Advertising')
• Delete a category (e.g., 'Delete Marketing category')
• Download categories

What would you like to do?`,
    });
  };

  const handlePayeeOperations = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    // Create payee
    const createMatch = userMessage.match(/(?:add|create)\s+([a-zA-Z0-9\s]+?)(?:\s+as\s+(?:a\s+)?payee)?$/i);
    if (createMatch) {
      const name = createMatch[1].trim();
      setPendingAction({
        type: "createPayee",
        data: { name },
      });
      addMessage({
        role: "assistant",
        content: `Sure! Would you like me to add "${name}" as a new payee? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // List payees
    if (lowerMessage.includes("list") || lowerMessage.includes("show") || lowerMessage.includes("all")) {
      await refreshPayees();
      const payeeList = payees.map((p) => `• ${p.name}`).join("\n");
      addMessage({
        role: "assistant",
        content: `Here are your payees:\n\n${payeeList || "No payees found."}`,
      });
      return;
    }

    // Update payee
    const updateMatch = userMessage.match(
      /(?:rename|update|change)\s+([a-zA-Z0-9\s]+?)\s+(?:to|as)\s+([a-zA-Z0-9\s]+)/i
    );
    if (updateMatch) {
      const oldName = updateMatch[1].trim();
      const newName = updateMatch[2].trim();
      const payee = payees.find((p) => p.name.toLowerCase() === oldName.toLowerCase());

      if (!payee) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee named "${oldName}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "updatePayee",
        data: { targetPayeeId: payee.id, newName },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to rename "${oldName}" to "${newName}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Delete payee
    const deleteMatch = userMessage.match(/(?:delete|remove)\s+([a-zA-Z0-9\s]+)/i);
    if (deleteMatch) {
      const name = deleteMatch[1].trim();
      const payee = payees.find((p) => p.name.toLowerCase() === name.toLowerCase());

      if (!payee) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee named "${name}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "deletePayee",
        data: { targetPayeeId: payee.id },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to delete the payee "${name}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Merge payees
    const mergeMatch = userMessage.match(/(?:merge)\s+([a-zA-Z0-9\s]+?)\s+(?:into|with)\s+([a-zA-Z0-9\s]+)/i);
    if (mergeMatch) {
      const sourceName = mergeMatch[1].trim();
      const targetName = mergeMatch[2].trim();
      const sourcePayee = payees.find((p) => p.name.toLowerCase() === sourceName.toLowerCase());
      const targetPayee = payees.find((p) => p.name.toLowerCase() === targetName.toLowerCase());

      if (!sourcePayee) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee named "${sourceName}". Please check the name and try again.`,
        });
        return;
      }

      if (!targetPayee) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a payee named "${targetName}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "mergePayees",
        data: { payeeIds: [sourcePayee.id], targetPayeeId: targetPayee.id },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to merge "${sourceName}" into "${targetName}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }
  };

  const handleCategoryOperations = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    // Create category (for patterns that don't specify type)
    const createMatch = userMessage.match(/(?:add|create)\s+([a-zA-Z0-9\s]+?)(?:\s+as\s+(?:a\s+)?category)?$/i);
    if (createMatch) {
      const name = createMatch[1].trim();
      setPendingAction({
        type: "createCategory",
        data: { name },
      });
      addMessage({
        role: "assistant",
        content: `Got it! Should "${name}" be an **income** category or an **expense** category?`,
      });
      return;
    }

    // List categories
    if (lowerMessage.includes("list") || lowerMessage.includes("show")) {
      await refreshCategories();
      let filteredCategories = categories;

      if (lowerMessage.includes("income")) {
        filteredCategories = categories.filter((c) => c.type === "Revenue");
      } else if (lowerMessage.includes("expense")) {
        filteredCategories = categories.filter((c) => c.type === "Expense");
      }

      const categoryList = filteredCategories.map((c) => `• ${c.name} (${c.type})`).join("\n");
      addMessage({
        role: "assistant",
        content: `Here are your ${
          lowerMessage.includes("income") ? "income" : lowerMessage.includes("expense") ? "expense" : ""
        } categories:\n\n${categoryList || "No categories found."}`,
      });
      return;
    }

    // Update category
    const updateMatch = userMessage.match(
      /(?:rename|update|change)\s+([a-zA-Z0-9\s]+?)\s+(?:to|as)\s+([a-zA-Z0-9\s]+)/i
    );
    if (updateMatch) {
      const oldName = updateMatch[1].trim();
      const newName = updateMatch[2].trim();
      const category = categories.find((c) => c.name.toLowerCase() === oldName.toLowerCase());

      if (!category) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a category named "${oldName}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "updateCategory",
        data: { targetCategoryId: category.id, newName },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to rename "${oldName}" to "${newName}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Delete category
    const deleteMatch = userMessage.match(/(?:delete|remove)\s+([a-zA-Z0-9\s]+?)(?:\s+category)?/i);
    if (deleteMatch) {
      const name = deleteMatch[1].trim();
      const category = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());

      if (!category) {
        addMessage({
          role: "assistant",
          content: `I couldn't find a category named "${name}". Please check the name and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "deleteCategory",
        data: { targetCategoryId: category.id },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to delete the category "${name}"? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }

    // Bulk create categories
    const bulkCreateMatch = userMessage.match(
      /(?:add|create)\s+(?:these\s+)?(\d+)\s+(?:new\s+)?categories?\s*:\s*([a-zA-Z0-9\s,]+)/i
    );
    if (bulkCreateMatch) {
      const count = parseInt(bulkCreateMatch[1]);
      const names = bulkCreateMatch[2]
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n);

      if (names.length !== count) {
        addMessage({
          role: "assistant",
          content: `I found ${names.length} names but you mentioned ${count} categories. Please check the names and try again.`,
        });
        return;
      }

      setPendingAction({
        type: "bulkCreateCategories",
        data: { bulkNames: names, bulkTypes: new Array(names.length).fill("Expense") },
      });
      addMessage({
        role: "assistant",
        content: `Would you like me to create ${count} categories: ${names.join(", ")}? ✅ Confirm | ❌ Cancel`,
      });
      return;
    }
  };

  const handleListOperations = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("payee")) {
      await refreshPayees();
      const payeeList = payees.map((p) => `• ${p.name}`).join("\n");
      addMessage({
        role: "assistant",
        content: `Here are your payees:\n\n${payeeList || "No payees found."}`,
      });
    } else if (lowerMessage.includes("categor")) {
      await refreshCategories();
      let filteredCategories = categories;

      if (lowerMessage.includes("income")) {
        filteredCategories = categories.filter((c) => c.type === "Revenue");
      } else if (lowerMessage.includes("expense")) {
        filteredCategories = categories.filter((c) => c.type === "Expense");
      }

      const categoryList = filteredCategories.map((c) => `• ${c.name} (${c.type})`).join("\n");
      addMessage({
        role: "assistant",
        content: `Here are your ${
          lowerMessage.includes("income") ? "income" : lowerMessage.includes("expense") ? "expense" : ""
        } categories:\n\n${categoryList || "No categories found."}`,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isPanelOpen) return null;

  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col shadow-lg transition-all duration-300 ease-in-out">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">AI Assistant</h2>
        <Button variant="ghost" size="sm" onClick={() => useAIStore.getState().setPanelOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                message.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-3 py-2 bg-gray-100 text-gray-900">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="text-sm">Processing...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isProcessing ? "Processing..." : "Type your message..."}
            disabled={isProcessing}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isProcessing} size="sm">
            {isProcessing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
