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

    // Get all payees for the company
    const { data: payees, error } = await supabase
      .from("payees")
      .select("id, name, created_at, updated_at")
      .eq("company_id", companyId)
      .order("name");

    if (error) {
      console.error("Error fetching payees:", error);
      return NextResponse.json({ error: "Failed to fetch payees" }, { status: 500 });
    }

    // Convert to CSV format
    const csvHeader = "ID,Name,Created At,Updated At\n";
    const csvRows =
      payees?.map((payee) => `"${payee.id}","${payee.name}","${payee.created_at}","${payee.updated_at}"`).join("\n") ||
      "";

    const csvContent = csvHeader + csvRows;

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="payees.csv"',
      },
    });
  } catch (error) {
    console.error("Error in GET /api/payee/download:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
