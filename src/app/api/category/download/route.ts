import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const parent_id = searchParams.get("parent_id");

    // Build query
    let query = supabase
      .from("chart_of_accounts")
      .select("id, name, type, parent_id, created_at, updated_at")
      .eq("company_id", companyId);

    // Add filters if provided
    if (type) {
      query = query.eq("type", type);
    }
    if (parent_id) {
      query = query.eq("parent_id", parent_id);
    }

    // Execute query with ordering
    const { data: categories, error } = await query
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching categories:", error);
      return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }

    // Convert to CSV format
    const csvHeader = "ID,Name,Type,Parent ID,Created At,Updated At\n";
    const csvRows =
      categories
        ?.map(
          (category) =>
            `"${category.id}","${category.name}","${category.type}","${category.parent_id || ""}","${
              category.created_at
            }","${category.updated_at}"`
        )
        .join("\n") || "";

    const csvContent = csvHeader + csvRows;

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="categories.csv"',
      },
    });
  } catch (error) {
    console.error("Error in GET /api/category/download:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
