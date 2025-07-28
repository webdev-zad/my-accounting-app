import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

export async function PUT(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get the category data from the request body
    const { id, name, type, parent_id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    // Check if category exists and belongs to the company
    const { data: existingCategory, error: checkError } = await supabase
      .from("chart_of_accounts")
      .select("id, name, type, parent_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (checkError || !existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Prepare update data
    const updateData: {
      name?: string;
      type?: string;
      parent_id?: string | null;
    } = {};

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Category name is required" }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (type !== undefined) {
      if (!ACCOUNT_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${ACCOUNT_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.type = type;
    }

    if (parent_id !== undefined) {
      if (parent_id) {
        // Validate parent category exists and belongs to company
        const { data: parentCategory, error: parentError } = await supabase
          .from("chart_of_accounts")
          .select("id, type")
          .eq("id", parent_id)
          .eq("company_id", companyId)
          .single();

        if (parentError || !parentCategory) {
          return NextResponse.json({ error: "Invalid parent category" }, { status: 400 });
        }

        // Validate that parent and child have the same type if type is being updated
        if (type && parentCategory.type !== type) {
          return NextResponse.json({ error: "Parent and child categories must have the same type" }, { status: 400 });
        }
      }
      updateData.parent_id = parent_id;
    }

    // Check for duplicate names (case-insensitive, excluding current category)
    if (name !== undefined) {
      const { data: duplicateCategories, error: duplicateError } = await supabase
        .from("chart_of_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .ilike("name", name.trim())
        .neq("id", id);

      if (duplicateError) {
        console.error("Error checking for duplicate categories:", duplicateError);
        return NextResponse.json({ error: "Error checking for duplicate categories" }, { status: 500 });
      }

      if (duplicateCategories && duplicateCategories.length > 0) {
        return NextResponse.json({ error: `Category "${name.trim()}" already exists.` }, { status: 400 });
      }
    }

    // Update the category
    const { data: updatedCategory, error: updateError } = await supabase
      .from("chart_of_accounts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating category:", updateError);
      return NextResponse.json({ error: `Failed to update category: ${updateError.message}` }, { status: 500 });
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
      category: updatedCategory,
      categories: categories || [],
    });
  } catch (error) {
    console.error("Error in PUT /api/category/update:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
