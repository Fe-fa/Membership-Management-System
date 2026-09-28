-- Baseline schema for dbo.Nm_custom_charge_line. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Nm_custom_charge_line', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Nm_custom_charge_line] (
        [nm_custom_charge_line_id] bigint IDENTITY(1,1) NOT NULL,
        [nm_custom_charge_id] bigint NOT NULL,
        [description] nvarchar(300) NOT NULL,
        [unit_price] decimal(18,2) NOT NULL,
        [quantity] decimal(18,2) NOT NULL,
        [subtotal] decimal(18,2) NOT NULL,
        CONSTRAINT [PK__Nm_custo__F3500C6C59EDBE09] PRIMARY KEY ([nm_custom_charge_line_id])
    );
END
GO
