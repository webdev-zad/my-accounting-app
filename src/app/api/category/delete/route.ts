import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get the category ID from the request body
    const { categoryId } = await request.json();

    if (!categoryId) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    // Check if category exists and belongs to the company
    const { data: existingCategory, error: checkError } = await supabase
      .from("chart_of_accounts")
      .select("id, name")
      .eq("id", categoryId)
      .eq("company_id", companyId)
      .single();

    if (checkError || !existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check if category has child categories
    const { data: childCategories, error: childError } = await supabase
      .from("chart_of_accounts")
      .select("id, name")
      .eq("parent_id", categoryId)
      .limit(1);

    if (childError) {
      console.error("Error checking child categories:", childError);
      return NextResponse.json({ error: "Error checking child categories" }, { status: 500 });
    }

    if (childCategories && childCategories.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete category "${existingCategory.name}" because it has child categories. Please delete or reassign the child categories first.`,
        },
        { status: 400 }
      );
    }

    // Check if category is being used in transactions
    const { data: transactionsUsingCategory, error: transactionError } = await supabase
      .from("transactions")
      .select("id")
      .eq("selected_category_id", categoryId)
      .limit(1);

    if (transactionError) {
      console.error("Error checking category usage in transactions:", transactionError);
      return NextResponse.json({ error: "Error checking category usage" }, { status: 500 });
    }

    if (transactionsUsingCategory && transactionsUsingCategory.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete category "${existingCategory.name}" because it is being used in transactions.` },
        { status: 400 }
      );
    }

    // Check if category is being used in imported transactions
    const { data: importedTransactionsUsingCategory, error: importedTransactionError } = await supabase
      .from("imported_transactions")
      .select("id")
      .eq("selected_category_id", categoryId)
      .limit(1);

    if (importedTransactionError) {
      console.error("Error checking category usage in imported transactions:", importedTransactionError);
      return NextResponse.json({ error: "Error checking category usage" }, { status: 500 });
    }

    if (importedTransactionsUsingCategory && importedTransactionsUsingCategory.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete category "${existingCategory.name}" because it is being used in imported transactions.`,
        },
        { status: 400 }
      );
    }

    // Check if category is being used in journal entries
    const { data: journalEntriesUsingCategory, error: journalError } = await supabase
      .from("journal")
      .select("id")
      .eq("chart_account_id", categoryId)
      .limit(1);

    if (journalError) {
      console.error("Error checking category usage in journal entries:", journalError);
      return NextResponse.json({ error: "Error checking category usage" }, { status: 500 });
    }

    if (journalEntriesUsingCategory && journalEntriesUsingCategory.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete category "${existingCategory.name}" because it is being used in journal entries.` },
        { status: 400 }
      );
    }

    // Delete the category
    const { error: deleteError } = await supabase.from("chart_of_accounts").delete().eq("id", categoryId);

    if (deleteError) {
      console.error("Error deleting category:", deleteError);
      return NextResponse.json({ error: `Failed to delete category: ${deleteError.message}` }, { status: 500 });
    }

    // Get updated categories list
    const { data: categories, error: categoriesError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (categoriesError) {
      console.error("Error fetching updated categories:", categoriesError);
    }

    return NextResponse.json({
      message: `Category "${existingCategory.name}" deleted successfully`,
      categories: categories || [],
    });
  } catch (error) {
    console.error("Error in DELETE /api/category/delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
