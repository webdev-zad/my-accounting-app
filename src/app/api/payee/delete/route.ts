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

    // Get the payee ID from the request body
    const { payeeId } = await request.json();

    if (!payeeId) {
      return NextResponse.json({ error: "Payee ID is required" }, { status: 400 });
    }

    // Check if payee exists and belongs to the company
    const { data: existingPayee, error: checkError } = await supabase
      .from("payees")
      .select("id, name")
      .eq("id", payeeId)
      .eq("company_id", companyId)
      .single();

    if (checkError || !existingPayee) {
      return NextResponse.json({ error: "Payee not found" }, { status: 404 });
    }

    // Check if payee is being used in transactions
    const { data: transactionsUsingPayee, error: transactionError } = await supabase
      .from("transactions")
      .select("id")
      .eq("payee_id", payeeId)
      .limit(1);

    if (transactionError) {
      console.error("Error checking payee usage in transactions:", transactionError);
      return NextResponse.json({ error: "Error checking payee usage" }, { status: 500 });
    }

    if (transactionsUsingPayee && transactionsUsingPayee.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete payee "${existingPayee.name}" because it is being used in transactions.` },
        { status: 400 }
      );
    }

    // Check if payee is being used in imported transactions
    const { data: importedTransactionsUsingPayee, error: importedTransactionError } = await supabase
      .from("imported_transactions")
      .select("id")
      .eq("payee_id", payeeId)
      .limit(1);

    if (importedTransactionError) {
      console.error("Error checking payee usage in imported transactions:", importedTransactionError);
      return NextResponse.json({ error: "Error checking payee usage" }, { status: 500 });
    }

    if (importedTransactionsUsingPayee && importedTransactionsUsingPayee.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete payee "${existingPayee.name}" because it is being used in imported transactions.` },
        { status: 400 }
      );
    }

    // Delete the payee
    const { error: deleteError } = await supabase.from("payees").delete().eq("id", payeeId);

    if (deleteError) {
      console.error("Error deleting payee:", deleteError);
      return NextResponse.json({ error: `Failed to delete payee: ${deleteError.message}` }, { status: 500 });
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

    return NextResponse.json({
      message: `Payee "${existingPayee.name}" deleted successfully`,
      payees: payees || [],
    });
  } catch (error) {
    console.error("Error in DELETE /api/payee/delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
