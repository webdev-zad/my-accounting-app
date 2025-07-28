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

    // Get the payee IDs from the request body
    const { payeeIds } = await request.json();

    if (!payeeIds || !Array.isArray(payeeIds) || payeeIds.length === 0) {
      return NextResponse.json({ error: "Payee IDs array is required" }, { status: 400 });
    }

    // Check if all payees exist and belong to the company
    const { data: existingPayees, error: checkError } = await supabase
      .from("payees")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", payeeIds);

    if (checkError) {
      console.error("Error checking payees:", checkError);
      return NextResponse.json({ error: "Error checking payees" }, { status: 500 });
    }

    if (!existingPayees || existingPayees.length !== payeeIds.length) {
      return NextResponse.json({ error: "Some payees not found or don't belong to this company" }, { status: 404 });
    }

    // Check if any payees are being used in transactions
    const { data: transactionsUsingPayees, error: transactionError } = await supabase
      .from("transactions")
      .select("payee_id")
      .in("payee_id", payeeIds)
      .limit(1);

    if (transactionError) {
      console.error("Error checking payee usage in transactions:", transactionError);
      return NextResponse.json({ error: "Error checking payee usage" }, { status: 500 });
    }

    if (transactionsUsingPayees && transactionsUsingPayees.length > 0) {
      const usedPayeeIds = transactionsUsingPayees.map((t) => t.payee_id);
      const usedPayees = existingPayees.filter((p) => usedPayeeIds.includes(p.id));
      const payeeNames = usedPayees.map((p) => p.name).join(", ");
      return NextResponse.json(
        { error: `Cannot delete payees: ${payeeNames}. They are being used in transactions.` },
        { status: 400 }
      );
    }

    // Check if any payees are being used in imported transactions
    const { data: importedTransactionsUsingPayees, error: importedTransactionError } = await supabase
      .from("imported_transactions")
      .select("payee_id")
      .in("payee_id", payeeIds)
      .limit(1);

    if (importedTransactionError) {
      console.error("Error checking payee usage in imported transactions:", importedTransactionError);
      return NextResponse.json({ error: "Error checking payee usage" }, { status: 500 });
    }

    if (importedTransactionsUsingPayees && importedTransactionsUsingPayees.length > 0) {
      const usedPayeeIds = importedTransactionsUsingPayees.map((t) => t.payee_id);
      const usedPayees = existingPayees.filter((p) => usedPayeeIds.includes(p.id));
      const payeeNames = usedPayees.map((p) => p.name).join(", ");
      return NextResponse.json(
        { error: `Cannot delete payees: ${payeeNames}. They are being used in imported transactions.` },
        { status: 400 }
      );
    }

    // Delete the payees
    const { error: deleteError } = await supabase.from("payees").delete().in("id", payeeIds);

    if (deleteError) {
      console.error("Error deleting payees:", deleteError);
      return NextResponse.json({ error: `Failed to delete payees: ${deleteError.message}` }, { status: 500 });
    }

    // Get updated payees list
    const { data: payees, error: payeesError } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    if (payeesError) {
      console.error("Error fetching updated payees:", payeesError);
    }

    const deletedPayeeNames = existingPayees.map((p) => p.name).join(", ");

    return NextResponse.json({
      message: `Successfully deleted ${existingPayees.length} payee(s): ${deletedPayeeNames}`,
      payees: payees || [],
    });
  } catch (error) {
    console.error("Error in DELETE /api/payee/bulk-delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
