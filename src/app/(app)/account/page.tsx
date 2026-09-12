"use client"

import { useEffect, useState } from "react"
import { changePassword, getAccountState } from "@/app/actions/account"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"

export default function AccountPage() {
  const [mustChange, setMustChange] = useState(false)

  useEffect(() => {
    getAccountState().then((row) => setMustChange(row.mustChangePassword))
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your login</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mustChange ? "Change this password before you do anything else." : "Change your password here. The main admin will see on Who did what that you changed it."}
        </p>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-3 font-semibold">Change password</h3>
        <ActionForm action={changePassword} submit="Save new password" className="space-y-3">
          <Input name="currentPassword" type="password" placeholder="The password you use now" required className="min-h-12" />
          <Input name="newPassword" type="password" placeholder="Your new password" required className="min-h-12" />
          <Input name="confirmPassword" type="password" placeholder="Type the new password again" required className="min-h-12" />
        </ActionForm>
      </div>
    </div>
  )
}
