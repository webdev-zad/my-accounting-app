import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get the payee IDs from the request body
    const { sourcePayeeId, targetPayeeId } = await request.json();

    if (!sourcePayeeId || !targetPayeeId) {
      return NextResponse.json({ error: "Source and target payee IDs are required" }, { status: 400 });
    }

    if (sourcePayeeId === targetPayeeId) {
      return NextResponse.json({ error: "Source and target payee cannot be the same" }, { status: 400 });
    }

    // Check if both payees exist and belong to the company
    const { data: payees, error: checkError } = await supabase
      .from("payees")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", [sourcePayeeId, targetPayeeId]);

    if (checkError) {
      console.error("Error checking payees:", checkError);
      return NextResponse.json({ error: "Error checking payees" }, { status: 500 });
    }

    if (!payees || payees.length !== 2) {
      return NextResponse.json(
        { error: "One or both payees not found or don't belong to this company" },
        { status: 404 }
      );
    }

    const sourcePayee = payees.find((p) => p.id === sourcePayeeId);
    const targetPayee = payees.find((p) => p.id === targetPayeeId);

    if (!sourcePayee || !targetPayee) {
      return NextResponse.json({ error: "One or both payees not found" }, { status: 404 });
    }

    // Update all transactions that use the source payee to use the target payee
    const { error: updateTransactionsError } = await supabase
      .from("transactions")
      .update({ payee_id: targetPayeeId })
      .eq("payee_id", sourcePayeeId);

    if (updateTransactionsError) {
      console.error("Error updating transactions:", updateTransactionsError);
      return NextResponse.json({ error: "Error updating transactions" }, { status: 500 });
    }

    // Update all imported transactions that use the source payee to use the target payee
    const { error: updateImportedTransactionsError } = await supabase
      .from("imported_transactions")
      .update({ payee_id: targetPayeeId })
      .eq("payee_id", sourcePayeeId);

    if (updateImportedTransactionsError) {
      console.error("Error updating imported transactions:", updateImportedTransactionsError);
      return NextResponse.json({ error: "Error updating imported transactions" }, { status: 500 });
    }

    // Delete the source payee
    const { error: deleteError } = await supabase.from("payees").delete().eq("id", sourcePayeeId);

    if (deleteError) {
      console.error("Error deleting source payee:", deleteError);
      return NextResponse.json({ error: "Error deleting source payee" }, { status: 500 });
    }

    // Get updated payees list
    const { data: updatedPayees, error: payeesError } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    if (payeesError) {
      console.error("Error fetching updated payees:", payeesError);
    }

    return NextResponse.json({
      message: `Successfully merged payee "${sourcePayee.name}" into "${targetPayee.name}"`,
      payees: updatedPayees || [],
    });
  } catch (error) {
    console.error("Error in POST /api/payee/merge:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
