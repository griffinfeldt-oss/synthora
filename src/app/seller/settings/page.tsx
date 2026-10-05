import type { Metadata } from "next";
import { requireSeller } from "@/server/session";
import { ActionForm } from "@/components/ActionForm";
import { Field, Input, Textarea } from "@/components/ui";
import { updateShopAction } from "../actions";

export const metadata: Metadata = { title: "Shop settings" };

export default async function SettingsPage() {
  const { seller } = await requireSeller();
  return (
    <div className="max-w-xl">
      <h2 className="font-serif text-[24px]">Shop settings</h2>
      <ActionForm action={updateShopAction} submitLabel="Save" className="mt-6">
        <Field label="Shop name" htmlFor="shopName">
          <Input id="shopName" name="shopName" defaultValue={seller.shopName} required />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" defaultValue={seller.location ?? ""} />
        </Field>
        <Field label="Bio" htmlFor="bio">
          <Textarea id="bio" name="bio" defaultValue={seller.bio ?? ""} />
        </Field>
      </ActionForm>
      <p className="mt-8 text-[13px] text-muted">Shop address: /s/{seller.slug}</p>
    </div>
  );
}
