import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get the categories data from the request body
    const { categories } = await request.json();

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: "Categories array is required" }, { status: 400 });
    }

    // Validate each category
    const validatedCategories = [];
    const errors = [];

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      const { name, type, parent_id } = category;

      // Validate required fields
      if (!name || typeof name !== "string" || !name.trim()) {
        errors.push(`Category ${i + 1}: Name is required`);
        continue;
      }

      if (!type || !ACCOUNT_TYPES.includes(type)) {
        errors.push(`Category ${i + 1}: Invalid type. Must be one of: ${ACCOUNT_TYPES.join(", ")}`);
        continue;
      }

      validatedCategories.push({
        name: name.trim(),
        type,
        parent_id: parent_id || null,
        company_id: companyId,
      });
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation errors", details: errors }, { status: 400 });
    }

    // Check for duplicate names (case-insensitive)
    const categoryNames = validatedCategories.map((c) => c.name);
    const { data: existingCategories, error: duplicateError } = await supabase
      .from("chart_of_accounts")
      .select("name")
      .eq("company_id", companyId)
      .in("name", categoryNames);

    if (duplicateError) {
      console.error("Error checking for duplicate categories:", duplicateError);
      return NextResponse.json({ error: "Error checking for duplicate categories" }, { status: 500 });
    }

    if (existingCategories && existingCategories.length > 0) {
      const duplicateNames = existingCategories.map((c) => c.name).join(", ");
      return NextResponse.json({ error: `Categories already exist: ${duplicateNames}` }, { status: 400 });
    }

    // Validate parent categories if specified
    const parentIds = validatedCategories.filter((c) => c.parent_id).map((c) => c.parent_id);

    if (parentIds.length > 0) {
      const { data: parentCategories, error: parentError } = await supabase
        .from("chart_of_accounts")
        .select("id, type")
        .eq("company_id", companyId)
        .in("id", parentIds);

      if (parentError) {
        console.error("Error checking parent categories:", parentError);
        return NextResponse.json({ error: "Error checking parent categories" }, { status: 500 });
      }

      if (!parentCategories || parentCategories.length !== parentIds.length) {
        return NextResponse.json({ error: "One or more parent categories not found" }, { status: 400 });
      }

      // Validate that parent and child have the same type
      for (const category of validatedCategories) {
        if (category.parent_id) {
          const parent = parentCategories.find((p) => p.id === category.parent_id);
          if (parent && parent.type !== category.type) {
            return NextResponse.json(
              { error: `Category "${category.name}" and its parent must have the same type` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Insert all categories
    const { data: insertedCategories, error: insertError } = await supabase
      .from("chart_of_accounts")
      .insert(validatedCategories)
      .select();

    if (insertError) {
      console.error("Error inserting categories:", insertError);
      return NextResponse.json({ error: `Failed to create categories: ${insertError.message}` }, { status: 500 });
    }

    // Get updated categories list
    const { data: allCategories, error: categoriesError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (categoriesError) {
      console.error("Error fetching updated categories:", categoriesError);
    }

    const createdNames = insertedCategories?.map((c) => c.name).join(", ");

    return NextResponse.json({
      message: `Successfully created ${insertedCategories?.length || 0} categories: ${createdNames}`,
      categories: insertedCategories || [],
      allCategories: allCategories || [],
    });
  } catch (error) {
    console.error("Error in POST /api/category/bulk-create:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
